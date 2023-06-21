/* eslint-disable import/no-extraneous-dependencies */
import fetch from 'cross-fetch';
import * as setCookieParser from 'set-cookie-parser';
import { AssetType } from './models/CmsAsset';

type AssetContent = {
  fields: Array<{ name: string, value: string }>
};

type FlatQueryDict = {
  [key: string]: string | number;
};

export default abstract class CrownPeakAgentBase {
  /** Individual cookie values */
  private cookies: { [key: string]: string } = {};

  protected readonly baseURL: string;

  protected readonly userName: string;

  protected readonly password: string;

  protected readonly cmsBaseUrl: string;

  protected readonly cmsInstance: string;

  protected readonly apiKey: string;

  /** used to for throttling */
  private nextRun = Date.now();

  /** used to for throttling */
  private readonly nextRunThrottle = 500;

  constructor({
    userName,
    password,
    cmsBaseUrl,
    cmsInstance,
    apiKey,
  }: {
    userName: string,
    password: string,
    cmsBaseUrl: string,
    cmsInstance: string,
    apiKey: string,
  }) {
    this.userName = userName;
    this.password = password;
    this.cmsBaseUrl = cmsBaseUrl;
    this.cmsInstance = cmsInstance;
    this.apiKey = apiKey;
    this.baseURL = `${cmsBaseUrl}/${cmsInstance}/cpt_webservice/accessapi`;
  }

  public async auth() {
    const body = {
      instance: this.cmsInstance,
      username: this.userName,
      password: this.password,
      remember_me: false,
    };

    const res: { 'resultCode': string } = await this.restPost('/auth/authenticate', body);
    return res.resultCode === 'conWS_Success';
  }

  public async assetExists(path: string): Promise<{ assetId: number, exists: boolean }> {
    const body = { assetIdOrPath: path };
    const res = await this.restPost('/asset/Exists', body);

    return { assetId: res.assetId, exists: res.exists };
  }

  protected async assetUpload(newName: string, folderId: number, modelId: number, workflowId: number, bytes: number) {
    const body = {
      newName,
      destinationFolderId: folderId,
      modelId,
      workflowId,
      bytes,
    };
    const res = await this.restPost('/asset/Upload', body);
    return res;
  }

  protected async assetCreate(newName: string, folderId: number, modelId: number, type: number) {
    const body = {
      newName,
      destinationFolderId: folderId,
      modelId,
      type,
    };
    if (folderId === 0 || folderId === undefined) {
      throw new Error('not allowed to import to root');
    }
    const res = await this.restPost('/asset/Create', body);
    return res;
  }

  public async assetUnlock(assetId: number) {
    const body = {
      assetIds: [assetId],
      forceUnlock: true,
    };
    const res = await this.restPost('/asset/unlock', body);
    return res;
  }

  public async assetUpdate(destId: number, fields: FlatQueryDict) {
    const body = {
      assetId: destId,
      fields,
      fieldsToDelete: [],
      fieldToDelete: '',
      runPostInput: true,
      runPostSave: true,
    };
    const res = await this.restPost('/Asset/Update', body);
    return res;
  }

  protected async assetBranch(destId: number) {
    const body = {
    };
    const res = await this.restPost(`/Asset/Branch/${destId}`, body);
    return res;
  }

  protected async assetPrepare(destId: number, fileName: string, modelId: number, totalSize: number) {
    const body = {
      destinationId: destId,
      label: fileName,
      totalSize,
      modelId,
    };
    const res = await this.restPost('/upload/assetprepare', body);
    return res;
  }

  protected async bytes(data: string, uploadTicket: string) {
    const body = {
      bytes: data,
      base64: null,
      checksum: null,
      uploadTicket,
    };
    const res = await this.restPost('/upload/bytes', body);
    return res;
  }

  protected async assetComplete(destId: number, fileName: string, modelId: number, uploadTicket: string) {
    const body = {
      destinationId: destId,
      label: fileName,
      modelId,
      uploadTicket,
    };
    const res = await this.restPost('/upload/assetcomplete', body);
    return res;
  }

  protected async assetRepublish(destId: number, commandId: number) {
    const body = {
      assetId: destId,
      commandId,
      skipDependencies: true,
    };
    const res = await this.restPost('/asset/executeworkflowcommand', body);
    return res;
  }

  protected async readAsset(assetId: number): Promise<AssetType> {
    const res = await this.restPost(`/asset/read/${assetId}`, {});
    const { asset } = res;

    // note there is a lot more data we can get from `asset`
    return asset;
  }

  public async getAssetContent({
    assetId,
  }: {
    assetId: number,
  }): Promise<AssetContent> {
    const res = await this.restPost(`/asset/fields/${assetId}`, {});
    return res;
  }

  public async getFolderContentAdvancedSearch(folderId: number) {
    const body = {
      limit: 15000,
      filterExpressions: [
        {
          filterId: 0,
          logical: 'NotSet',
          name: '[Type]',
          propertyName: 'Type',
          operation: 'NotEquals',
          orderId: 1,
          valueDropDown: 4,
        }],
      sortOrder: null,
      baseAssetId: folderId,
      additionalBuiltInFields: null,
      responseType: 'WorklistAsset',
      pageNumber: 0,
      pageSize: 15000,
    };
    const res = await this.restPost('/asset/advancedsearch', body);
    return res.searchResults;
  }

  protected async deleteAsset(assetId: number) {
    const status = await this.readAsset(assetId);
    if (status.createdBy !== 'Zink Bot') {
      throw new Error('Can only delete files created by "Zink Bot"');
    }

    return this.restPost(`/asset/delete/${assetId}`, {});
  }

  public async routeAssets(assetIds: number[], workflowStatusId: number) {
    const body = {
      list: assetIds,
      stateId: workflowStatusId,
      stateChangeCheck: false,
      publishDependencies: false,
    };
    return this.restPost('/asset/routeassets', body);
  }

  async getOrCreateAssetId(label: string, containgFolderId: number, statusId: number, assetModelId: number) {
    const body = {
      limit: 500,
      filterExpressions: [
        {
          filterId: 0,
          logical: 'And',
          name: '[Label]',
          propertyName: 'Label',
          operation: 'Equals',
          orderId: 1,
          value: `${label}`,
        },
        {
          filterId: 0,
          logical: 'NotSet',
          name: '[FolderId]',
          propertyName: 'FolderId',
          operation: 'Equals',
          orderId: 2,
          value: `${containgFolderId}`,
        },
      ],
      sortOrder: null,
      baseAssetId: 0,
      additionalBuiltInFields: null,
      responseType: 'WorklistAsset',
      pageNumber: 0,
      pageSize: 50,
    };
    const res = await this.restPost('/asset/advancedsearch', body);
    const results = res.searchResults;
    if (results.length) {
      // eslint-disable-next-line no-restricted-syntax
      for (const result of results) {
        if (result.status === statusId) return result.id;
      }
      // should branch the exist asset and return the new asset branch
      const createdAsset = await this.assetBranch(results[0].id);
      return createdAsset.asset.id;
    }
    const createdAsset = await this.assetCreate(label, containgFolderId, assetModelId, 2);
    return createdAsset.asset.id;
  }

  async getOrCreateFolderId(label: string, containgFolderId: number, folderModelId: number) {
    const body = {
      limit: 500,
      filterExpressions: [
        {
          filterId: 0,
          logical: 'And',
          name: '[Label]',
          propertyName: 'Label',
          operation: 'Equals',
          orderId: 1,
          value: `${label}`,
        },
        {
          filterId: 0,
          logical: 'NotSet',
          name: '[FolderId]',
          propertyName: 'FolderId',
          operation: 'Equals',
          orderId: 2,
          value: `${containgFolderId}`,
        },
      ],
      sortOrder: null,
      baseAssetId: 0,
      additionalBuiltInFields: null,
      responseType: 'WorklistAsset',
      pageNumber: 0,
      pageSize: 50,
    };
    const res = await this.restPost('/asset/advancedsearch', body);
    const results = res.searchResults;
    if (results.length > 1) {
      throw new Error('More than one folder with the same name in this path.');
    }
    if (results.length) {
      return results[0].id;
    }
    const createdAsset = await this.assetCreate(label, containgFolderId, folderModelId, 4);
    return createdAsset.asset.id;
  }

  // http call
  protected async restPost(url: string, body: object) {
    await new Promise((res) => {
      const int = setInterval(() => {
        if (this.nextRun > Date.now()) {
          return;
        }

        clearInterval(int);
        res(null);
      }, 100);
    });

    this.nextRun = Date.now() + this.nextRunThrottle;

    const fullUrl = this.baseURL + url;

    const bodyContent = body;
    const headers: { [key: string]: string } = {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json; charset=utf8',
      Accept: 'application/json',
      Host: 'cms.crownpeak.net',
      'User-Agent': 'Zink-bot/1.0',
    };

    if (this.hasCookies()) {
      headers.Cookie = this.getCookieJarHeader();
    }

    const options = {
      method: 'POST',
      headers,
      body: JSON.stringify(bodyContent),
    };

    try {
      const resp = await fetch(fullUrl, options);
      const json = await resp.json();
      this.processCookies(resp.headers);
      return json;
    } catch (err) {
      throw new Error(`Error calling: ${fullUrl}`);
    }
  }

  /** Return cookie jar as header */
  private getCookieJarHeader() {
    return Object.entries(this.cookies).map(([kk, vv]) => `${kk}=${vv}`).join(';');
  }

  /** Return true if we have cookies */
  private hasCookies() {
    return Object.entries(this.cookies).length > 0;
  }

  // handles cookies between http calls
  private processCookies(headers: Headers) {
    const interesting = [
      'ASP.NET_SessionId',
      'GLBSESSIONID',
      'CMSSESSIONIDALT',
      'AWSALB',
      'AWSALBCORS',
    ];

    // Hack to get each set-cookie header alone
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const setCookieHeaders: string[] = (headers as any).raw()['set-cookie'];

    setCookieHeaders.forEach((setCookie) => {
      const r = setCookieParser.parseString(setCookie);
      if (!interesting.includes(r.name)) {
        return;
      }

      this.cookies[r.name] = r.value;
    });
  }
}
