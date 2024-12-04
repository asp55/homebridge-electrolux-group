import type { PlatformAccessory } from "homebridge";

import type { ElectroluxPluginPlatform, PlatformAccessoryContext } from "../platform.js";
import { ElectroluxPlatformAccessory } from "./electroluxPlatformAccessory.js";


/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export default class FGRC064WA100 extends ElectroluxPlatformAccessory {

  constructor(
    platform: ElectroluxPluginPlatform,
    accessory: PlatformAccessory<PlatformAccessoryContext>
  ) {
    super(platform, accessory);
    /*
    //console.log("Context", accessory.context.device);
    const appliance = accessory.context.appliance;
    console.log("Appliance", appliance);

    this.platform.electroluxAPI.applianceInfo(appliance.applianceId)
      .then(info=>{
        // console.log(`Appliance ${appliance.applianceId} info:`);
        // console.log(JSON.stringify(info, null, 2));
        this.accessory.getService(this.platform.Service.AccessoryInformation)!
          .setCharacteristic(this.platform.Characteristic.Manufacturer, info.applianceInfo.brand)
          .setCharacteristic(this.platform.Characteristic.Model, `${info.applianceInfo.model} - ${info.applianceInfo.variant} (${info.applianceInfo.colour})`)
          .setCharacteristic(this.platform.Characteristic.SerialNumber, info.applianceInfo.serialNumber)
          .setCharacteristic(this.platform.Characteristic.Name, appliance.applianceName);

      });
      */
  }

}
