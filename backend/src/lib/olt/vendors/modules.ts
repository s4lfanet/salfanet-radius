import * as huawei from './huawei';
import * as zte from './zte';
import * as fiberhome from './fiberhome';
import * as bdcom from './bdcom';
import * as raisecom from './raisecom';
import * as hioso from './hioso';
import * as cdata from './cdata';
import * as hsgq from './hsgq';
import * as vsol from './vsol';

export type VendorModule = typeof huawei;

/** The reader for a saved vendor name. Unknown names keep the long-standing Huawei default. */
export function getVendorModule(vendor: string | null | undefined): VendorModule {
  switch (vendor?.toLowerCase()) {
    case 'zte':       return zte as any as VendorModule;
    case 'fiberhome': return fiberhome as any as VendorModule;
    case 'bdcom':     return bdcom as any as VendorModule;
    case 'raisecom':  return raisecom as any as VendorModule;
    case 'hioso':     return hioso as any as VendorModule;
    case 'cdata':
    case 'c-data':    return cdata as any as VendorModule;
    case 'hsgq':      return hsgq as any as VendorModule;
    case 'vsol':
    case 'v-sol':     return vsol as any as VendorModule;
    default:          return huawei;
  }
}
