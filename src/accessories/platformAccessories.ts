import { ElectroluxPlatformAccessory } from "./electroluxPlatformAccessory";
import FGRC064WA100 from "./FGRC064WA100.js";

type modelClasses = Record<string, typeof ElectroluxPlatformAccessory>;
type brandModelClasses = Record<string, modelClasses>;

const FRIGIDAIRE:modelClasses = {
  fgrc064wa100: FGRC064WA100
};

export default class PlatformAccessories {
  private static classes:brandModelClasses = {
    frigidaire: FRIGIDAIRE
  };

  static supported(brand:string, model:string):boolean {
    const supportedBrands = Object.keys(this.classes);
    if(!supportedBrands.includes(brand.toLowerCase())) {
      return false;
    }

    const supportedModels = Object.keys(this.classes[brand.toLowerCase()]);

    return supportedModels.includes(model.toLowerCase());
  }

  static accessory(brand:string, model:string):typeof ElectroluxPlatformAccessory {
    if(!this.supported(brand, model)) {
      throw("Unsupported Model. No constructor available.");
    }
    
    return this.classes[brand.toLowerCase()][model.toLowerCase()];

  }
}