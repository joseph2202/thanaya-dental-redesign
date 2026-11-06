type ProductPhotos={image?:string|null;gallery?:unknown};
// One source order for cards, details and cart snapshots. Gallery-only uploads
// are real product photos too; never replace them with a missing-photo claim.
export function productImages({image,gallery}:ProductPhotos):string[]{
  const sources=[image,...(Array.isArray(gallery)?gallery:[])];
  return [...new Set(sources.filter((value):value is string=>typeof value==='string'&&!!value.trim())
    .map(value=>value.trim().replace(/https?:\/\/(?:localhost|127\.0\.0\.1):4000\/uploads\//gi,'/uploads/')))];
}
