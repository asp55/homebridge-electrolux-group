import type { Logging} from 'homebridge';

import { EventEmitter } from "events";
import fs from 'fs/promises';
import axios, {AxiosInstance} from 'axios';

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

export class ElectroluxAPI extends EventEmitter  {

  private _axios:AxiosInstance = axios.create({ baseURL: 'https://api.developer.electrolux.one/api/v1' });

  private _ready:boolean = false;
  private _apiKey:string|undefined = undefined;
  private _config:fallbackConfig|undefined = undefined;
  private _tokensCache:string|undefined = undefined;

  private _tokens:APITokens|undefined = undefined;

  constructor(
    public readonly log: Logging,
    options:ElectroluxAPIOptions = {}
  ) {
    super()

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
            const {accessToken, accessTokenType, refreshToken, expiration} =  JSON.parse(contents.toString());
            const expiresIn = expiration - Date.now();
            this._tokens = {accessToken, accessTokenType, refreshToken, expiresIn};

            if(expiresIn > -30000) {
              //Tokens shouldn't be expired
              this.log.debug('Updating tokens');
              this.updateTokenFromCache();
            }
            else {
              this.log.debug('Cached tokens have expired, let\'s try what\'s in config.');
              this.updateTokenFromConfig();
            }
            
          }, 
          err=>{ 
            if(err.code === 'ENOENT') {
              this.log.debug('No cache, let\'s try what\'s in config.');
              this.updateTokenFromConfig();
            }
            else {
              this.log.error(JSON.stringify(err));
            }
          },
        );
    }
  }

  private async updateTokenFromCache() {
    this.log.debug("updateTokenFromCache");
    if(this._tokens !== undefined) {
      const {accessToken, accessTokenType, refreshToken} = this._tokens;
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
        })
    }
  }

  private async updateTokenFromConfig() {
    this.log.debug("updateTokenFromConfig");
    if(this._config !== undefined) {
      const {accessToken, accessTokenType, refreshToken} = this._config;
      this.updateToken(accessToken, accessTokenType, refreshToken);
    }
  }

  private async updateToken(accessToken:string, accessTokenType:string, refreshToken:string) {
    return await new Promise((resolve, reject)=>{
      this._axios({
        method: 'post',
        url: '/token/refresh',
        headers: {
          'x-api-key': this._apiKey,
          'Authorization': `${accessTokenType} ${accessToken}`,
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
          const expirationTimeout = (response.data.expiresIn-30)*1000
          

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

          setTimeout(()=>this.updateTokenFromCache(), expirationTimeout);

          this._ready = true;
          this.emit('ready');
          resolve('success');

        }
        else if(response.status === 401) {
          this.log.error(`Error 401: Unauthorized - Usually this means that the access tokens expired without being refreshed. Please update access token & refresh token in configuration.`);
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



  async appliances():Promise<ElectroluxAPIAppliance[]> {
    if(!this._ready) {
      this.log.error("Can't pull appliances until the API is ready");
    }
    else if(this._tokens !== undefined) {
      this.log.debug("Getting appliances");
      return await this._axios({
        method: 'get',
        url: '/appliances',
        headers: {
          'x-api-key': this._apiKey,
          'Authorization': `${this._tokens.accessTokenType} ${this._tokens.accessToken}`,
        },
  
      })
      .then(response=>response.data)

    }

    return [];


  }
}