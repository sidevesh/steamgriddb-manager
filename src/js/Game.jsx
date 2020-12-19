import React from 'react';
import PropTypes from 'prop-types';
import { Redirect } from 'react-router-dom';
import Image from 'react-uwp/Image';
import Button from 'react-uwp/Button';
import PubSub from 'pubsub-js';
import TopBlur from './Components/TopBlur';
import Steam from './Steam';
import heroPlaceholder from '../img/hero_none.png';
import capsuleVerticalPlaceholder from '../img/capsule_vertical_none.png';
import capsulePlaceholder from '../img/capsule_none.png';
import logoPlaceholder from '../img/logo_none.png';

const { join } = window.require('path');
const fs = window.require('fs');
const { dialog } = window.require('electron').remote;

class Game extends React.Component {
  constructor(props) {
    super(props);
    this.toSearch = this.toSearch.bind(this);
    this.onRemove = this.onRemove.bind(this);
    this.onPickFile = this.onPickFile.bind(this);

    const { location } = this.props;

    this.state = {
      game: location.state,
      toSearch: false,
      userdataGridPath: null,
      librarycachePath: null,
    };

    PubSub.publish('showBack', true);
  }

  componentDidMount() {
    const { game } = this.state;
    const self = this;

    Steam.getSteamPath().then((steamPath) => {
      Steam.getLoggedInUser().then((user) => {
        const userdataGridPath = join(steamPath, 'userdata', String(user), 'config', 'grid');

        // Find defaults from the cache if it doesn't exist
        const librarycachePath = join(steamPath, 'appcache', 'librarycache');

        self.setState({
          userdataGridPath,
          librarycachePath,
        });
      });
    });
  }

  toSearch(assetType) {
    const { location } = this.props;
    this.setState({ toSearch: <Redirect to={{ pathname: '/search', state: { ...location.state, assetType } }} /> });
  }

  onRemove(steamAssetType) {
    const { location } = this.props;
    const game = location.state;
    const self = this;

    Steam.addAsset(steamAssetType, game.appid, '').then(() => {
      PubSub.publish('toast', {
        logoNode: 'CheckMark',
        title: 'Successfully Removed!',
        contents: (
          <p>
            Asset is set to the original image.
          </p>
        ),
      });
      // self.setState({ toGame: <Redirect to={{ pathname: '/game', state: location.state }} /> });
      self.forceUpdate();
    });
  }

  onPickFile(steamAssetType) {
    const { location } = this.props;
    const game = location.state;
    const self = this;

    dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Images', extensions: ['jpg', 'png', 'gif'] },
      ]
    }, function (files) {
      if (files !== undefined && files.length) {
        Steam.addAsset(steamAssetType, game.appid, files[0]).then(() => {
          PubSub.publish('toast', {
            logoNode: 'CheckMark',
            title: 'Successfully Added!',
            contents: (
              <p>
                Asset is set to the specified image.
              </p>
            ),
          });

          self.forceUpdate();
      // self.setState({ toGame: <Redirect to={{ pathname: '/game', state: location.state }} /> });
        });
      }
    });
  }

  addNoCache(steamAssetType) {
    var steamType = null;
    var cacheName = null;
    var uri = null;
    const {
      game,
      userdataGridPath,
      librarycachePath,
    } = this.state;

    switch (steamAssetType) {
      case 'horizontalGrid':
        cacheName = 'header.jpg';
        break;
      case 'verticalGrid':
        cacheName = 'library_600x900.jpg';
        break;
      case 'hero':
        cacheName = 'library_hero.jpg';
        break;
      case 'logo':
        cacheName = 'logo.jpg';
        break;
    }

    if (userdataGridPath) {
      var newUri = Steam.getCustomImage(steamAssetType, userdataGridPath, game.appid);

      if (fs.existsSync(newUri)) {
        uri = newUri;
      }
    }

    if (!uri && librarycachePath) {
      var newUri = join(librarycachePath, `${game.appid}_${cacheName}`);

      if (fs.existsSync(newUri)) {
        uri = newUri;
      }
    }

    if (!fs.existsSync(uri)) {
      return false;
    }

    return `${uri}?${(new Date().getTime())}`;
  }

  render() {
    const {
      toSearch,
      game,
    } = this.state;

    if (toSearch) {
      return toSearch;
    }

    const { theme } = this.context;
    const titleStyle = {
      ...theme.typographyStyles.subTitle,
      padding: '20px 0px 10px 0',
      width: '100%',
    };
    const buttonStyle = {
      padding: 0,
    };

    return (
      <>
        <TopBlur />
        <div
          id="search-container"
          style={{
            height: '100%',
            overflow: 'auto',
            padding: 15,
            paddingLeft: 10,
            paddingTop: 45,
          }}
        >
          <h1 style={theme.typographyStyles.header}>{game.name}</h1>
          <h5 style={titleStyle}>Hero</h5>
          <Button style={buttonStyle} onClick={() => this.toSearch('hero')}>
            <Image
              style={{
                width: '100%',
                height: 'auto',
              }}
              src={this.addNoCache('hero') || heroPlaceholder}
            />
          </Button>
          <Button
            icon="Delete"
            label="Reset"
            onClick={() => this.onRemove('hero')}
          />
          <Button
            icon="Add"
            label="Custom Image"
            onClick={() => this.onPickFile('hero')}
          />

          <div style={{ display: 'flex' }}>
            <div style={{ flex: 1 }}>
              <h5 style={titleStyle}>Vertical Capsule</h5>
              <Button style={buttonStyle} onClick={() => this.toSearch('verticalGrid')}>
                <Image
                  style={{
                    maxWidth: '100%',
                    height: 'auto',
                  }}
                  src={this.addNoCache('verticalGrid') || capsuleVerticalPlaceholder}
                />
              </Button>
              <Button
                icon="Delete"
                label="Reset"
                onClick={() => this.onRemove('verticalGrid')}
              />
              <Button
                icon="Add"
                label="Custom Image"
                onClick={() => this.onPickFile('verticalGrid')}
              />
            </div>
            <div
              style={{
                marginLeft: 10,
                flex: 1,
              }}
            >
              <h5 style={titleStyle}>Horizontal Capsule</h5>
              <Button style={buttonStyle} onClick={() => this.toSearch('horizontalGrid')}>
                <Image
                  style={{
                    maxWidth: '100%',
                    height: 'auto',
                  }}
                  src={this.addNoCache('grid') || capsulePlaceholder}
                />
              </Button>
              <Button
                icon="Delete"
                label="Reset"
                onClick={() => this.onRemove('horizontalGrid')}
              />
              <Button
                icon="Add"
                label="Custom Image"
                onClick={() => this.onPickFile('horizontalGrid')}
              />
            </div>
          </div>
          <div>
            <h5 style={titleStyle}>Logo</h5>
            <Button style={buttonStyle} onClick={() => this.toSearch('logo')}>
              <Image
                style={{
                  maxWidth: '100%',
                  height: 'auto',
                }}
                src={this.addNoCache('logo') || logoPlaceholder}
              />
            </Button>
            <Button
              icon="Delete"
              label="Reset"
              onClick={() => this.onRemove('logo')}
            />
            <Button
              icon="Add"
              label="Custom Image"
              onClick={() => this.onPickFile('logo')}
            />
          </div>
        </div>
      </>
    );
  }
}

Game.propTypes = {
  location: PropTypes.object.isRequired,
};
Game.contextTypes = { theme: PropTypes.object };
export default Game;
