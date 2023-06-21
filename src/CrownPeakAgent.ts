import fs from 'fs';
import CrownPeakAgentBase from './CrownPeakAgentBase';

export default class CrownPeakAgent extends CrownPeakAgentBase {
  public async updateFile(assetId: number, commandId: number, assetLabel: string, srcFile: string, assetModel: number) {
    try {
      /** reading the file async */
      const fileData = await fs.promises.readFile(srcFile);

      /** codding the file */
      const bytes = Buffer.from(fileData).toString('base64');
      const dataSize = fileData.byteLength;

      /** prepareTheAsset */
      const assetPrepareRes = await this.assetPrepare(
        assetId,
        assetLabel,
        assetModel,
        dataSize,
      );

      /** get the upload Ticket */
      const { uploadTicket } = assetPrepareRes;

      /** upload the file */
      await this.bytes(bytes, uploadTicket);

      /** complete the change */
      await this.assetComplete(
        assetId,
        assetLabel,
        assetModel,
        uploadTicket,
      );

      /** republish the asset */
      const routeRes = await this.routeAssets(
        [assetId],
        commandId,
      );
      // eslint-disable-next-line no-console
      console.log(routeRes);

      /** clear tempCookies */
    } catch (err) {
      throw new Error(`can't upload the file ${err}`);
    }
  }
}
