// Minimal ambient declarations for untyped card-code libraries.
declare module 'qrcode' {
  interface QRModules { size: number; data: Uint8Array | number[]; }
  interface QRCodeObject { modules: QRModules; }
  interface QRCodeStatic {
    create(text: string, opts?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }): QRCodeObject;
    toDataURL(text: string, opts?: any): Promise<string>;
  }
  const QRCode: QRCodeStatic;
  export default QRCode;
}

declare module 'jsbarcode' {
  const JsBarcode: (element: any, value: string, options?: Record<string, any>) => void;
  export default JsBarcode;
}
