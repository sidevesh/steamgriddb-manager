import React from 'react';
import PropTypes from 'prop-types';
import PubSub from 'pubsub-js';
import ImportList from './Components/Import/ImportList';
import ImportAllButton from './Components/Import/ImportAllButton';
import Spinner from './Components/spinner';
import TopBlur from './Components/TopBlur';
import Steam from './Steam';
import platformModules from './importers';

const Store = window.require('electron-store');
const SGDB = window.require('steamgriddb');
const { metrohash64 } = window.require('metrohash');
const log = window.require('electron-log');
const { join, extname, dirname } = window.require('path');
const Lnf = window.require('lnf');

class Import extends React.Component {
  constructor(props) {
    super(props);

    this.addGame = this.addGame.bind(this);
    this.addGames = this.addGames.bind(this);

    this.store = new Store();

    this.platforms = Object.keys(platformModules).map((key) => ({
      id: platformModules[key].id,
      name: platformModules[key].name,
      class: platformModules[key].default,
      games: [],
      grids: [],
      posters: [],
      heroes: [],
      installed: false,
      error: false,
    }));

    this.SGDB = new SGDB('b971a6f5f280490ab62c0ee7d0fd1d16');

    this.state = {
      isLoaded: false,
      loadingText: '',
      installedPlatforms: [],
    };
  }

  componentDidMount() {
    Promise.all(this.platforms.map((platform) => platform.class.isInstalled()))
      .then((values) => {
        // Set .installed
        this.platforms.forEach((platform, index) => {
          platform.installed = values[index];
        });

        const installedPlatforms = this.platforms.filter((platform) => (platform.installed));

        // Do .getGames() in sequential order
        const getGames = installedPlatforms
          .reduce((promise, platform) => promise.then(() => {
            this.setState({ loadingText: `Grabbing games from ${platform.name}...` });
            return platform.class.getGames().then((games) => {
              // Populate games array
              platform.games = games;
            });
          }).catch((err) => {
            platform.error = true;
            log.info(`Import: ${platform.id} rejected ${err}`);
          }), Promise.resolve());

        getGames.then(() => {
          this.setState({ loadingText: 'Getting images...' });

          const gridsPromises = [];
          installedPlatforms.forEach((platform) => {
            // Get grids for each platform
            const ids = platform.games.map((x) => encodeURIComponent(x.id));
            const gameName = platform.games.map((x) => x.name);
            const getGrids = this.SGDB.getGrids({ type: platform.id, id: ids.join(',') }).then((res) => {
              platform.grids = this._formatResponse(ids, res);
              return res;
            }).catch((err) => {
              // show an error toast
              if (err.message == "Game not found") {
                const checkPromises = this.checkFailedGames([{ id: ids, name: gameName }]);
                Promise.all(checkPromises).then((res) => this.logFailedGames(res));  
              }
              else {
                log.info(`getGrids: ${err}`);
              }
            });
            gridsPromises.push(platform.games.map(x => ({ name: x.name, id: x.id })));
            gridsPromises.push(getGrids);
          });

          // Update state after we got the grids
          Promise.all(gridsPromises).then((res) => {
            this.setState({
              isLoaded: true,
              installedPlatforms,
            });
            var failedGames = [];
            for (var i = 0; i < res.length; i += 2) {
              var games = res[i];
              var result = res[i + 1];

              // we will only find errors here for a multiple id search, in single search on error will be caught above
              if (games.length > 1) {
                games.map((game, i) => {
                  if ((!result[i].success) && result[i].errors[0] == "Game not found") {
                    failedGames.push(games[i]);
                  }
                });
              }
            }
            const checkPromises = this.checkFailedGames(failedGames);
            Promise.all(checkPromises).then((res) => this.logFailedGames(res));
          });
        }).catch((err) => {
          log.info(`Import: ${err}`);
        });
      });
  }

  logFailedGames(res) {
    for (var i = 0; i < res.length; i += 2) {
      var pre = res[i];
      var msgs = res[i + 1];

      log.info(pre);
      msgs.map((msg) => {
        log.info(msg);
      });
    }
  }

  checkFailedGames(failedGames) {
    var promises = [];

    failedGames.map((failedGame) => {
      promises.push(`Game '${failedGame.name}', id '${failedGame.id}' not found, looking for alternatives...`);
      const sg = new Promise((resolve, reject) => {
        this.SGDB.searchGame(failedGame.name).then((res) => {
          var results = [];
          res.forEach((altGame, i) => {
            const altGameTypes = JSON.stringify(altGame.types);
            results.push(`${i}: name: '${altGame.name}', id: '${altGame.id}', type: '${altGameTypes}'`);
          });

          resolve(results);
        }).catch((err) => {
          reject(`searchGame: ${err}`);
        });
      });
      promises.push(sg);
    });

    return promises;
  }

  saveImportedGames(games) {
    const gamesStorage = this.store.get('games', {});
    games.forEach((game) => {
      gamesStorage[metrohash64(game.exe + (game.params !== 'undefined' ? game.params : ''))] = game;
    });
    this.store.set('games', gamesStorage);
  }

  // @todo this is horrible but can't be arsed right now
  _formatResponse(ids, res) {
    let formatted = false;
    // if only single id then return first grid
    if (ids.length === 1) {
      if (res.length > 0) {
        formatted = [res[0]];
      }
    } else {
      // if multiple ids treat each object as a request
      formatted = res.map((x) => {
        if (x.success) {
          if (x.data[0]) return x.data[0];
        }
        return false;
      });
    }
    return formatted;
  }

  addGames(games, platform) {
    this.saveImportedGames(games);

    const shortcuts = games.map((game) => ({
      name: game.name,
      exe: game.exe,
      startIn: game.startIn,
      params: game.params,
      tags: [platform.name],
      icon: game.icon,
    }));

    log.info(`Trying to import ${games.length} games from ${platform.name}`);

    Steam.addShortcuts(shortcuts).then(() => {
      Steam.addCategory(games, platform.name).then(() => {
        PubSub.publish('toast', {
          logoNode: 'ImportAll',
          title: 'Successfully Imported!',
          contents: (
            <p>
              {games.length}
              { ' ' }
              games imported from
              { ' ' }
              {platform.name}
            </p>
          ),
        });
      }).then(() => {
        // Download images
        PubSub.publish('toast', {
          logoNode: 'Download',
          title: 'Downloading Images...',
          contents: (<p>Downloading images for imported games...</p>),
        });

        const ids = games.map((x) => encodeURIComponent(x.id));
        let posters = [];
        let heroes = [];

        // Get posters
        const getPosters = this.SGDB.getGrids({ type: platform.id, id: ids.join(','), dimensions: ['600x900'] }).then((res) => {
          posters = this._formatResponse(ids, res);
        }).catch((err) => {
          log.info(`getGrids: ${err}`);
          // show an error toast
        });

        // Get heroes
        const getHeroes = this.SGDB.getHeroes({ type: platform.id, id: ids.join(',') }).then((res) => {
          heroes = this._formatResponse(ids, res);
        }).catch((err) => {
          log.info(`getHeroes: ${err}`);
          // show an error toast
        });

        Promise.all([getPosters, getHeroes]).then(() => {
          const downloadPromises = [];
          games.forEach((game, i) => {
            const appId = Steam.generateNewAppId(game.exe, game.name);

            // Take (legacy) grids from when we got them for the ImportList
            const savedGrid = platform.grids[platform.games.indexOf(games[i])];
            if (platform.grids[i] && savedGrid) {
              const appIdOld = Steam.generateAppId(game.exe, game.name);
              const saveGrids = Steam.addAsset('horizontalGrid', appId, savedGrid.url).then((dest) => {
                // Symlink to old appid so it works in BPM
                Lnf.sync(dest, join(dirname(dest), `${appIdOld}${extname(dest)}`));
              });
              downloadPromises.push(saveGrids);
            }

            // Download posters
            if (posters[i]) {
              downloadPromises.push(Steam.addAsset('verticalGrid', appId, posters[i].url));
            }

            // Download heroes
            if (heroes[i]) {
              downloadPromises.push(Steam.addAsset('hero', appId, heroes[i].url));
            }
          });

          Promise.all(downloadPromises).then(() => {
            PubSub.publish('toast', {
              logoNode: 'Download',
              title: 'Downloads Complete',
              contents: (<p>All Images Downloaded!</p>),
            });
          });
        });
      }).catch((err) => {
        if (err.type === 'OpenError') {
          PubSub.publish('toast', {
            logoNode: 'Error',
            title: 'Error Importing',
            contents: (
              <p>
                Cannot import while Steam is running.
                <br />
                Close Steam and try again.
              </p>
            ),
          });
        }
      });
    });
  }

  addGame(game, platform) {
    return this.addGames([game], platform);
  }

  render() {
    const { isLoaded, loadingText, installedPlatforms } = this.state;
    const { theme } = this.context;

    if (!isLoaded) {
      return (<Spinner text={loadingText} />);
    }

    return (
      <>
        <TopBlur />
        <div
          id="import-container"
          style={{
            height: '100%',
            overflow: 'auto',
            padding: 15,
            paddingLeft: 10,
            paddingTop: 45,
          }}
        >
          {
            installedPlatforms.map((platform) => {
              if (!platform.error) {
                return (
                  <div key={platform.id}>
                    <h5 style={{ float: 'left', ...theme.typographyStyles.subTitle }}>{platform.name}</h5>
                    <ImportAllButton
                      games={platform.games}
                      platform={platform}
                      grids={platform.grids}
                      onButtonClick={this.addGames}
                    />
                    <ImportList
                      games={platform.games}
                      platform={platform}
                      grids={platform.grids}
                      onImportClick={this.addGame}
                    />
                  </div>
                );
              }
              return <></>;
            })
          }
        </div>
      </>
    );
  }
}

Import.contextTypes = { theme: PropTypes.object };
export default Import;
