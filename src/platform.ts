import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';

import { ElectroluxPlatformAccessory } from './platformAccessory.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';
import Axios, { AxiosInstance } from 'axios';
import fs from 'fs/promises';

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class ElectroluxPluginPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly Ready: boolean = false;

  private axios:AxiosInstance = Axios.create({ baseURL: 'https://api.developer.electrolux.one/api/v1' });
  private storagePath: string;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;
    this.storagePath = api.user.storagePath();


    const requiredConfig = ['apiKey', 'accessToken', 'accessTokenType', 'refreshToken'];
    const haveRequired = requiredConfig.map(v=>this.config[v] && this.config[v]!=='');
    if(haveRequired.reduce((a,c)=>a&&c, true)) {

      
      fs
        .readFile(`${this.storagePath}/${PLUGIN_NAME}_cache`)
        .then(
          v=>{
            const cachedTokens = JSON.parse(v.toString());
            console.log('Cache file: ', cachedTokens);

            const msToExpiration = (cachedTokens.expiration) - Date.now();
            if(msToExpiration > -30000) {
              //Tokens shouldn't be expired
              if(msToExpiration < 0) {
                this.log.debug('Tokens will expire in under 30 seconds. Let\'s update them now.');
                this.updateToken(cachedTokens.accessToken, cachedTokens.accessTokenType, cachedTokens.refreshToken);
              }
              else {
                this.log.debug('Cached tokens don\'t expire for a while. Let\'s set a timeout for the refresh.');
                setTimeout(()=>this.updateToken(cachedTokens.accessToken, cachedTokens.accessTokenType, cachedTokens.refreshToken), msToExpiration)
              }
            }
            else {
              this.log.debug('Cached tokens have expired, let\'s try what\'s in config');
              this.updateToken(this.config.accessToken, this.config.accessTokenType, this.config.refreshToken);

            }
            
          }, 
          err=>{ 
            if(err.code === 'ENOENT') {
              this.log.debug('No cache, let\'s update');
              this.updateToken(this.config.accessToken, this.config.accessTokenType, this.config.refreshToken);
            }
            else {
              this.log.error(JSON.stringify(err));
            }
          },
        );

      this.Ready = true;
    }
    else {
      const configParamTitles = ['Electrolux API Key', 'Access Token', 'Access token type',  'Refresh Token'];

      const missingConfig = haveRequired.reduce((a,c,i) => {
        if(!c) {
          return `${a}\n ${configParamTitles[i]} [${requiredConfig[i]}]`;
        }
        else {
          return a;
        }

      }, '');

      this.log.error(`Missing required configuration. Please add or update: ${missingConfig}`);
    }

    this.log.debug('Finished initializing platform:', this.config);



    

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      log.debug('Executed didFinishLaunching callback');
      // run the method to discover / register your devices as accessories
      this.discoverDevices();
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache, so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    this.log.debug('Discover Devices');
    if(!this.Ready) {
      this.log.debug('Missing required config parameters, aborting.');
      return;
    }
    
    this.axios({
      method: 'get',
      url: '/appliances',
      headers: {
        'x-api-key': this.config.apiKey,
        'Authorization': `${this.config.accessTokenType} ${this.config.accessToken}`,
      },

    }).then(response=>{
      this.log.debug(JSON.stringify(response.data, null, 2));
    });



    // // EXAMPLE ONLY
    // // A real plugin you would discover accessories from the local network, cloud services
    // // or a user-defined array in the platform config.
    // const exampleDevices = [
    //   {
    //     exampleUniqueId: 'ABCD',
    //     exampleDisplayName: 'Bedroom',
    //   },
    //   {
    //     exampleUniqueId: 'EFGH',
    //     exampleDisplayName: 'Kitchen',
    //   },
    // ];

    // // loop over the discovered devices and register each one if it has not already been registered
    // for (const device of exampleDevices) {
    //   // generate a unique id for the accessory this should be generated from
    //   // something globally unique, but constant, for example, the device serial
    //   // number or MAC address
    //   const uuid = this.api.hap.uuid.generate(device.exampleUniqueId);

    //   // see if an accessory with the same uuid has already been registered and restored from
    //   // the cached devices we stored in the `configureAccessory` method above
    //   const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

    //   if (existingAccessory) {
    //     // the accessory already exists
    //     this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

    //     // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. e.g.:
    //     // existingAccessory.context.device = device;
    //     // this.api.updatePlatformAccessories([existingAccessory]);

    //     // create the accessory handler for the restored accessory
    //     // this is imported from `platformAccessory.ts`
    //     new ElectroluxPlatformAccessory(this, existingAccessory);

    //     // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, e.g.:
    //     // remove platform accessories when no longer present
    //     // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
    //     // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
    //   } else {
    //     // the accessory does not yet exist, so we need to create it
    //     this.log.info('Adding new accessory:', device.exampleDisplayName);

    //     // create a new accessory
    //     const accessory = new this.api.platformAccessory(device.exampleDisplayName, uuid);

    //     // store a copy of the device object in the `accessory.context`
    //     // the `context` property can be used to store any data about the accessory you may need
    //     accessory.context.device = device;

    //     // create the accessory handler for the newly create accessory
    //     // this is imported from `platformAccessory.ts`
    //     new ElectroluxPlatformAccessory(this, accessory);

    //     // link the accessory to your platform
    //     this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    //   }
    // }
  }

  async updateToken(accessToken:string, accessTokenType:string, refreshToken:string) {
    console.log('UPDATE TOKEN', accessToken, accessTokenType, refreshToken);
    await this.axios({
      method: 'post',
      url: '/token/refresh',
      headers: {
        'x-api-key': this.config.apiKey,
        'Authorization': `${accessTokenType} ${accessToken}`,
      },
      data: {
        refreshToken: refreshToken
      },
      validateStatus: function (status) {
        return [200,401,403,500].includes(status); // Resolve only if the status code is less than 500
      }
    })
    .then(response=>{
      if(response.status===200) {
        console.log('New token info:', response.data);

        const expirationTimeout = (response.data.expiresIn-30)*1000
        

        const data = {
          accessToken: response.data.accessToken,
          accessTokenType: response.data.tokenType,
          refreshToken: response.data.refreshToken,
          expiration: Date.now()+expirationTimeout
        };
        fs.writeFile(`${this.storagePath}/${PLUGIN_NAME}_cache`, JSON.stringify(data));

        setTimeout(()=>this.updateToken(data.accessToken, data.accessTokenType, data.refreshToken), expirationTimeout);

      }
      else if(response.status === 401) {
        this.log.error(`Error 401: Unauthorized - Usually this means that the access tokens expired without being refreshed. Please update access token & refresh token in configuration.`);
      }
      else { 
        this.log.error(`Error ${response.status}: ${response.data.message} - ${response.data.detail}`);
      }
    })
    .catch(err=>{
      this.log.error(`Error ${err.status}: ${err.message}`);
    });
  }
}
