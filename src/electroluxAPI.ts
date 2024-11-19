import type { Logging } from "homebridge";

import { EventEmitter } from "events";
import fs from "fs/promises";
import axios, { AxiosResponse } from "axios";
import rateLimit, { RateLimitedAxiosInstance } from "axios-rate-limit";

type fallbackConfig = {
  accessToken: string;
  accessTokenType: string;
  refreshToken: string;
}

type APITokens = {
  accessToken: string;
  accessTokenType: string;
  refreshToken: string;
  expiresIn: number;

}

type ElectroluxAPIOptions = {
  apiKey?: string;
  tokensCache?:string;
  fallbackConfig?:fallbackConfig;
}

type ElectroluxAPIAppliance = {
  applianceId: string;
  applianceName: string;
  applianceType: string;
  created: string;
}

type ElectroluxAPIApplianceInfo = {
  applianceInfo: {
    serialNumber: string;
    pnc: string;
    brand: string;
    deviceType: string;
    model: string;
    variant: string;
    colour: string;
  };
  capabilities: Record<string, string| Record<string, string>>;
}


type ElectroluxAPIApplianceState = {
  applianceId: string;
  connectionState: string;
  status: string;
  properties: Record<string, string | Record<string, string>>;
};

export class ElectroluxAPI extends EventEmitter  {

  private _axios:RateLimitedAxiosInstance = rateLimit(axios.create({ baseURL: "https://api.developer.electrolux.one/api/v1" }), { maxRPS:5 });

  private _ready:boolean = false;
  private _apiKey:string|undefined = undefined;
  private _config:fallbackConfig|undefined = undefined;
  private _tokensCache:string|undefined = undefined;

  private _tokens:APITokens|undefined = undefined;

  constructor(
    public readonly log: Logging,
    options:ElectroluxAPIOptions = {}
  ) {
    super();

    if(options.apiKey) {
      this.apiKey = options.apiKey;
    }
    if(options.tokensCache) {
      this.tokensCache = options.tokensCache;
    }
    if(options.fallbackConfig) {
      this.fallbackConfig = options.fallbackConfig;
    }    
  }

  private init():void {
    if(this._tokensCache !== undefined && this._config !== undefined) {
      this.log.debug("Setting up connection to ElectroluxAPI");

      fs
        .readFile(this._tokensCache)
        .then(
          contents=>{
            const { accessToken, accessTokenType, refreshToken, expiration } =  JSON.parse(contents.toString());
            const expiresIn = expiration - Date.now();
            this._tokens = { accessToken, accessTokenType, refreshToken, expiresIn };

            if(expiresIn >= 0) {
              //Tokens shouldn't be expired
              this.log.debug("Updating tokens");
              this.updateTokenFromCache();
            }
            else {
              this.log.debug("Cached tokens have expired, let's try what's in config.");
              this.updateTokenFromConfig();
            }
            
          }, 
          err=>{ 
            if(err.code === "ENOENT") {
              this.log.debug("No cache, let's try what's in config.");
              this.updateTokenFromConfig();
            } 
            else {
              this.log.error(JSON.stringify(err));
            }
          }
        );
    }
  }

  private async updateTokenFromCache(force:boolean = false) {
    this.log.debug("updateTokenFromCache");
    if(this._tokens !== undefined) {
      const { accessToken, accessTokenType, refreshToken, expiresIn } = this._tokens;

      if(!force && expiresIn > 60000) {
        this.log.debug("Tokens shouldn't update for a while, so let's try getting the appliances list instead. If that fails, we'll have to update anyway.");
        const startThisAll = Date.now();
        this._getAppliances()
          .then(()=>{
            this.log.debug("That worked");
            const adjustedTimeout = expiresIn - (startThisAll - Date.now());
            setTimeout(()=>this.updateTokenFromCache(), adjustedTimeout-30000);

            this._ready = true;
            this.emit("ready");
          })
          .catch(err=>{
            if(err.status===401) {
              this.log.debug("Unauthorized. Let's try to update the tokens.");
              this.updateTokenFromCache(true);
            }
          });

      }
      else {
        this
          .updateToken(accessToken, accessTokenType, refreshToken)
          .catch((rejectionCode)=>{
            if(rejectionCode===401) {
              this.updateTokenFromConfig();
            }
            else if(rejectionCode===429) {
              this.log.debug("Too many requests. We probably restarted homebridge too many times too quickly. Let's wait 10 seconds and try again.");
              //setTimeout(()=>this.updateTokenFromCache(), 10000);
            }
          });
      }
    }
  }

  private async updateTokenFromConfig() {
    this.log.debug("updateTokenFromConfig");
    if(this._config !== undefined) {
      const { accessToken, accessTokenType, refreshToken } = this._config;
      this.updateToken(accessToken, accessTokenType, refreshToken);
    }
  }

  private async updateToken(accessToken:string, accessTokenType:string, refreshToken:string) {
    return await new Promise((resolve, reject)=>{
      this._axios({
        method: "post",
        url: "/token/refresh",
        headers: {
          "x-api-key": this._apiKey,
          "Authorization": `${accessTokenType} ${accessToken}`
        },
        data: {
          refreshToken: refreshToken
        },
        validateStatus: function (status) {
          return [200,401,403,429,500].includes(status); // Resolve only if the status code is less than 500
        }
      })
        .then(response=>{
          if(response.status===200) {
            const expirationTimeout = response.data.expiresIn*1000;
          

            const data = {
              accessToken: response.data.accessToken,
              accessTokenType: response.data.tokenType,
              refreshToken: response.data.refreshToken,
              expiration: Date.now()+expirationTimeout
            };
            if(typeof this._tokensCache === "string") {
              fs.writeFile(this._tokensCache, JSON.stringify(data));
            }

            this._tokens = {
              accessToken: data.accessToken,
              accessTokenType: data.accessTokenType,
              refreshToken: data.refreshToken,
              expiresIn: expirationTimeout
            };

            setTimeout(()=>this.updateTokenFromCache(), expirationTimeout-30000);

            this._ready = true;
            this.emit("ready");
            resolve("success");

          }
          else if(response.status === 401) {
            this.log.error("Error 401: Unauthorized - Usually this means that the access tokens expired without being refreshed.");
            this.log.error("Please update access token & refresh token in configuration.");
            reject(401);
          }
          else { 
            this.log.error(`Error ${response.status}: ${response.data.message} - ${response.data.detail}`);
            reject(response.status);
          }
        })
        .catch(err=>{
          this.log.error(`Error ${err.status}: ${err.message}`);
          reject(err.status);
        });
    });

    
  }

  set tokensCache(value:string) {
    this._tokensCache = value;
    this.init();
  }

  set fallbackConfig(value:fallbackConfig) {
    this._config = value;
    this.init();
  }

  set apiKey(value:string) {
    this._apiKey = value;
    this.init();
  }

  get ready():boolean {
    return this._ready;
  }

  private _getAppliances():Promise<AxiosResponse<ElectroluxAPIAppliance[]>> {
    return new Promise((resolve, reject) =>{
      if(this._tokens !== undefined) {
        resolve(
          this._axios<ElectroluxAPIAppliance[]>({
            method: "get",
            url: "/appliances",
            headers: {
              "x-api-key": this._apiKey,
              "Authorization": `${this._tokens.accessTokenType} ${this._tokens.accessToken}`
            }
      
          })
        );
      }
      else {
        reject();
      }
    });
  }

  async appliances():Promise<ElectroluxAPIAppliance[]> {
    if(!this._ready) {
      this.log.error("Can't pull appliances until the API is ready");
      throw("API Not Ready");
    }

    this.log.debug("Getting appliances");
    return await this._getAppliances()
      .then(response=>response.data);

  }

  async applianceInfo(applianceId:string):Promise<ElectroluxAPIApplianceInfo> {
    if(!this._ready) {
      this.log.error("Can't pull appliances until the API is ready");
      throw("API Not Ready");
    }

    if(this._tokens === undefined) {
      throw("Authorization tokens undefined");
    }

    return await this._axios<ElectroluxAPIApplianceInfo>({
      method: "get",
      url: `/appliances/${applianceId}/info`,
      headers: {
        "x-api-key": this._apiKey,
        "Authorization": `${this._tokens.accessTokenType} ${this._tokens.accessToken}`
      }
    })
      .then(response=>response.data as ElectroluxAPIApplianceInfo);
  }



  async applianceState(applianceId:string):Promise<ElectroluxAPIApplianceState> {
    if(!this._ready) {
      this.log.error("Can't pull appliances until the API is ready");
      throw("API Not Ready");
    }

    if(this._tokens === undefined) {
      throw("Authorization tokens undefined");
    }

    return await this._axios<ElectroluxAPIApplianceState>({
      method: "get",
      url: `/appliances/${applianceId}/state`,
      headers: {
        "x-api-key": this._apiKey,
        "Authorization": `${this._tokens.accessTokenType} ${this._tokens.accessToken}`
      }
    })
      .then(response=>response.data as ElectroluxAPIApplianceState);
  }

  async applianceCommand(applianceId:string, command:object):Promise<boolean> {
    if(!this._ready) {
      this.log.error("Can't pull appliances until the API is ready");
      throw("API Not Ready");
    }

    if(this._tokens === undefined) {
      throw("Authorization tokens undefined");
    }

    return await this._axios({
      method: "put",
      url: `/appliances/${applianceId}/command`,
      headers: {
        "x-api-key": this._apiKey,
        "Authorization": `${this._tokens.accessTokenType} ${this._tokens.accessToken}`
      },
      data: command
    })
      .then(response=>{
        if(response.status===200 || response.status === 202) {
          return true;
        }
        else {
          return false;
        }
      });

  }
}