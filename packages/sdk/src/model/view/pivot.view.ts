import { PivotViewCore } from '@teable/core';
import { updateViewOptions } from '@teable/openapi';
import { Mixin } from 'ts-mixer';
import { requestWrap } from '../../utils/requestWrap';
import { View } from './view';

export class PivotView extends Mixin(PivotViewCore, View) {
  async updateOption(options: Partial<PivotView['options']>) {
    return await requestWrap(updateViewOptions)(this.tableId, this.id, {
      options,
    });
  }
}
