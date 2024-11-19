import type { API, Characteristic, DynamicPlatformPlugin, Logging, PlatformAccessory, PlatformConfig, Service } from "homebridge";

import { ElectroluxPlatformAccessory } from "./platformAccessory.js";
import { PLATFORM_NAME, PLUGIN_NAME } from "./settings.js";
import { ElectroluxAPI } from "./electroluxAPI.js";

/**
 * HomebridgePlatform
 * This class is the main constructor for your plugin, this is where you should
 * parse the user config and discover/register accessories with Homebridge.
 */
export class ElectroluxPluginPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  // public readonly Ready: boolean = false;
  // private axios:AxiosInstance = Axios.create({ baseURL: 'https://api.developer.electrolux.one/api/v1' });
  // private storagePath: string;

  public electroluxAPI:ElectroluxAPI;

  // this is used to track restored cached accessories
  public readonly accessories: PlatformAccessory[] = [];

  constructor(
    public readonly log: Logging,
    public readonly config: PlatformConfig,
    public readonly api: API
  ) {
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.electroluxAPI = new ElectroluxAPI(log, { tokensCache: `${api.user.storagePath()}/${PLUGIN_NAME}_cache` } );


    const requiredConfig = ["apiKey", "accessToken", "accessTokenType", "refreshToken"];
    const haveRequired = requiredConfig.map(v=>this.config[v] && this.config[v]!=="");
    if(haveRequired.reduce((a,c)=>a&&c, true)) {
      this.electroluxAPI.apiKey = this.config.apiKey;
      this.electroluxAPI.fallbackConfig = {
        accessToken: this.config.accessToken,
        accessTokenType: this.config.accessTokenType,
        refreshToken: this.config.refreshToken
      };
    }
    else {
      const configParamTitles = ["Electrolux API Key", "Access Token", "Access token type",  "Refresh Token"];

      const missingConfig = haveRequired.reduce((a,c,i) => {
        if(!c) {
          return `${a}\n ${configParamTitles[i]} [${requiredConfig[i]}]`;
        }
        else {
          return a;
        }

      }, "");

      this.log.error(`Missing required configuration. Please add or update: ${missingConfig}`);
    }

    this.log.debug("Finished initializing platform:", this.config);



    

    // When this event is fired it means Homebridge has restored all cached accessories from disk.
    // Dynamic Platform plugins should only register new accessories after this event was fired,
    // in order to ensure they weren't added to homebridge already. This event can also be used
    // to start discovery of new accessories.
    this.api.on("didFinishLaunching", () => {
      log.debug("Executed didFinishLaunching callback");
      
      this.electroluxAPI.on("ready", ()=>{
        log.debug("Executed electroluxAPI ready callback");
        // run the method to discover / register your devices as accessories
        this.discoverDevices();

      });
    });
  }

  /**
   * This function is invoked when homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  configureAccessory(accessory: PlatformAccessory) {
    this.log.info("Loading accessory from cache:", accessory.displayName);

    // add the restored accessory to the accessories cache, so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  /**
   * This is an example method showing how to register discovered accessories.
   * Accessories must only be registered once, previously created accessories
   * must not be registered again to prevent "duplicate UUID" errors.
   */
  discoverDevices() {
    this.log.debug("Discover Devices");
    this.electroluxAPI.appliances().then(appliances=>{
      for(const appliance of appliances) {
        // generate a unique id for the accessory from the electrolux appliance id
        const uuid = this.api.hap.uuid.generate(appliance.applianceId);

        // see if an accessory with the same uuid has already been registered and restored from
        // the cached devices we stored in the `configureAccessory` method above
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (existingAccessory) {
          // the accessory already exists
          this.log.info("Restoring existing accessory from cache:", existingAccessory.displayName);

          // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. e.g.:
          // existingAccessory.context.device = device;
          // this.api.updatePlatformAccessories([existingAccessory]);

          // create the accessory handler for the restored accessory
          // this is imported from `platformAccessory.ts`
          new ElectroluxPlatformAccessory(this, existingAccessory);

          // it is possible to remove platform accessories at any time using `api.unregisterPlatformAccessories`, e.g.:
          // remove platform accessories when no longer present
          // this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
          // this.log.info('Removing existing accessory from cache:', existingAccessory.displayName);
        }
        else {
          // the accessory does not yet exist, so we need to create it
          this.log.info("Adding new accessory:", appliance.applianceName);

          // create a new accessory
          const accessory = new this.api.platformAccessory(appliance.applianceName, uuid);

          // store a copy of the device object in the `accessory.context`
          // the `context` property can be used to store any data about the accessory you may need
          accessory.context.device = appliance;

          // create the accessory handler for the newly create accessory
          // this is imported from `platformAccessory.ts`
          new ElectroluxPlatformAccessory(this, accessory);

          // link the accessory to your platform
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
        }
      }
    });
    
  }
}
