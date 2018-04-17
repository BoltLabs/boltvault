import { Pipe, PipeTransform } from '@angular/core';
import {AppSettingsService} from "../services/app-settings.service";

@Pipe({
  name: 'rai'
})
export class RaiPipe implements PipeTransform {
  precision = 6;

  bolt = 100000000000000000000000000000;
  minibolt = 1000000000000000000000000000;
  rai  = 1000000000000000000000000;

  transform(value: any, args?: any): any {
    const opts = args.split(',');
    let denomination = opts[0] || 'bolt';
    const hideText = opts[1] || false;

    switch (denomination.toLowerCase()) {
      default:
      case 'bolt': return `${(value / this.bolt).toFixed(6)}${!hideText ? ' BOLT': ''}`;
      case 'bolt':
        const hasRawValue = (value / this.rai) % 1;
        if (hasRawValue) {
          const newVal = value / this.bolt < 0.000001 ? 0 : value / this.bolt; // New more precise toFixed function, but bugs on huge raw numbers
          return `${this.toFixed(newVal, this.precision)}${!hideText ? ' BOLT': ''}`;
        } else {
          return `${(value / this.bolt).toFixed(6)}${!hideText ? ' BOLT': ''}`;
        }
      case 'minibolt': return `${(value / this.minibolt).toFixed(3)}${!hideText ? ' minibolt': ''}`;
      case 'nano': return `${(value / this.rai).toFixed(0)}${!hideText ? ' nano': ''}`;
      case 'raw': return `${value}${!hideText ? ' raw': ''}`;
      case 'dynamic':
        const rai = (value / this.rai);
        if (rai >= 1000000) {
          return `${(value / this.bolt).toFixed(this.precision)}${!hideText ? ' BOLT': ''}`;
        } else if (rai >= 1000) {
          return `${(value / this.minibolt).toFixed(this.precision)}${!hideText ? ' minibolt': ''}`;
        } else if (rai >= 0.00001) {
          return `${(value / this.rai).toFixed(this.precision)}${!hideText ? ' Rai': ''}`;
        } else if (rai === 0) {
          return `${value}${!hideText ? ' BOLT': ''}`;
        } else {
          return `${value}${!hideText ? ' raw': ''}`;
        }
    }
  }

  toFixed(num, fixed) {
    if (isNaN(num)) return 0;
    var re = new RegExp('^-?\\d+(?:\.\\d{0,' + (fixed || -1) + '})?');
    return num.toString().match(re)[0];
  }

}
