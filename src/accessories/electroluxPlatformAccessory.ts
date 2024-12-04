import type { PlatformAccessory } from "homebridge";

import type { ElectroluxPluginPlatform, PlatformAccessoryContext } from "../platform.js";


/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class ElectroluxPlatformAccessory {

  constructor(
    private readonly platform: ElectroluxPluginPlatform,
    private readonly accessory: PlatformAccessory<PlatformAccessoryContext>
  ) {
    
    platform.log.debug(`Constructing ${this.constructor.name} [Appliance ID: ${accessory.context.appliance.applianceId}]`);
    platform.log.debug("Context: "+JSON.stringify(accessory.context.info, null, 2));
    const appliance = accessory.context.appliance;
    const info = accessory.context.info;

    this.accessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, info.brand)
      .setCharacteristic(this.platform.Characteristic.Model, `${info.model} - ${info.variant} (${info.colour})`)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, info.serialNumber)
      .setCharacteristic(this.platform.Characteristic.Name, appliance.applianceName);
  }

}
