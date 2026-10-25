export interface CouponCardData {
  code?: string;
  offerSlot?: number;
  offerTitle: string;
  offerDescription: string;
  expiresAt: string;
}

/**
 * Formats ISO timestamp to readable IST string
 */
export function formatIstDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

/**
 * Wraps text into lines that fit within a maximum width on the canvas context
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
}

/**
 * Draws rounded rectangle helper
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Generates 1080x1350 PNG offer card blob
 */
export async function generateOfferCardBlob(data: CouponCardData): Promise<Blob> {
  // Wait for web fonts to load
  try {
    if (document.fonts) {
      await Promise.all([
        document.fonts.load('bold 60px Fredoka'),
        document.fonts.load('bold 72px Fredoka'),
        document.fonts.load('36px Nunito'),
        document.fonts.load('bold 48px Nunito'),
      ]);
    }
  } catch {
    // Continue if font load API unavailable
  }

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  // Brand Colors
  const COLOR_PINK = '#FF4FA3';
  const COLOR_CYAN = '#22D3EE';
  const COLOR_WHITE = '#FFFFFF';
  const COLOR_INK = '#2B1B2E';

  // 1. Solid White Background
  ctx.fillStyle = COLOR_WHITE;
  ctx.fillRect(0, 0, 1080, 1350);

  // 2. Outer Border (clean thin pink rim)
  ctx.strokeStyle = COLOR_PINK;
  ctx.lineWidth = 12;
  ctx.strokeRect(24, 24, 1080 - 48, 1350 - 48);

  let currentY = 140;

  // 3. Logo at top (or Fredoka wordmark fallback)
  try {
    const logoImg = new Image();
    logoImg.crossOrigin = 'anonymous';
    logoImg.src = '/logo.png';
    await new Promise<void>((resolve, reject) => {
      logoImg.onload = () => resolve();
      logoImg.onerror = () => reject();
      setTimeout(reject, 600); // 600ms timeout for logo fetch
    });
    const maxLogoHeight = 110;
    const aspect = logoImg.width / logoImg.height;
    const logoWidth = Math.min(420, maxLogoHeight * aspect);
    const logoHeight = logoWidth / aspect;
    ctx.drawImage(logoImg, (1080 - logoWidth) / 2, currentY - 30, logoWidth, logoHeight);
    currentY += 130;
  } catch {
    // Wordmark fallback
    ctx.fillStyle = COLOR_PINK;
    ctx.font = 'bold 84px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Cravory', 540, currentY + 30);
    currentY += 130;
  }

  // 4. Cyan Rule
  ctx.beginPath();
  ctx.moveTo(140, currentY);
  ctx.lineTo(940, currentY);
  ctx.strokeStyle = COLOR_CYAN;
  ctx.lineWidth = 6;
  ctx.setLineDash([]);
  ctx.stroke();
  currentY += 100;

  // 5. "Congratulations!" (Fredoka)
  ctx.fillStyle = COLOR_INK;
  ctx.font = 'bold 58px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Congratulations!', 540, currentY);
  currentY += 80;

  // 6. Offer Number Badge (e.g. "OFFER 1")
  const offerNumberLabel = data.offerSlot ? `OFFER ${data.offerSlot}` : 'SPECIAL OFFER';
  ctx.fillStyle = COLOR_PINK;
  ctx.font = 'bold 64px Fredoka, sans-serif';
  ctx.fillText(offerNumberLabel, 540, currentY);
  currentY += 80;

  // 7. Offer Title (Large in Ink)
  ctx.fillStyle = COLOR_INK;
  ctx.font = 'bold 60px Fredoka, sans-serif';
  const titleLines = wrapText(ctx, data.offerTitle, 860);
  for (const line of titleLines) {
    ctx.fillText(line, 540, currentY);
    currentY += 72;
  }
  currentY += 16;

  // 8. Description (Ink)
  ctx.fillStyle = COLOR_INK;
  ctx.font = '34px Nunito, sans-serif';
  const descLines = wrapText(ctx, data.offerDescription, 820);
  for (const line of descLines) {
    ctx.fillText(line, 540, currentY);
    currentY += 50;
  }
  currentY += 40;

  // 9. Framed Counter Claim Box
  const boxWidth = 820;
  const boxHeight = 150;
  const boxX = (1080 - boxWidth) / 2;
  const boxY = currentY;

  ctx.strokeStyle = COLOR_CYAN;
  ctx.lineWidth = 6;
  ctx.setLineDash([16, 12]);
  roundRect(ctx, boxX, boxY, boxWidth, boxHeight, 16);
  ctx.stroke();
  ctx.setLineDash([]);

  // Counter text inside box
  ctx.fillStyle = COLOR_PINK;
  ctx.font = 'bold 40px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SHOW THIS AT THE CRAVORY COUNTER', 540, boxY + 65);

  ctx.fillStyle = COLOR_INK;
  ctx.font = 'bold 28px Nunito, sans-serif';
  ctx.fillText('TO CLAIM YOUR CELEBRATION OFFER', 540, boxY + 110);

  currentY += boxHeight + 60;

  // 10. "Valid till <date>"
  ctx.fillStyle = COLOR_INK;
  ctx.font = 'bold 32px Nunito, sans-serif';
  ctx.fillText(`Valid till ${formatIstDate(data.expiresAt)}  •  1 offer per bill`, 540, currentY);

  // 11. "Cravory's 1st anniversary" at the bottom
  ctx.fillStyle = COLOR_PINK;
  ctx.font = 'bold 36px Fredoka, sans-serif';
  ctx.fillText("Cravory's 1st anniversary", 540, 1270);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to generate image blob'));
    }, 'image/png');
  });
}

/**
 * Handles image delivery following the exact required priority order:
 * 1. Web Share API with file (iOS "Save Image")
 * 2. <a download>
 * 3. Fallback: open image in new tab with hint
 */
export async function deliverOfferImage(data: CouponCardData): Promise<{ method: 'share' | 'download' | 'tab' }> {
  const blob = await generateOfferCardBlob(data);
  const fileName = data.offerSlot ? `cravory-offer-${data.offerSlot}.png` : (data.code ? `cravory-offer-${data.code}.png` : 'cravory-anniversary-offer.png');
  const file = new File([blob], fileName, { type: 'image/png' });

  // 1. Web Share API
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({
        files: [file],
        title: 'Cravory 1st Anniversary Offer',
        text: `My Cravory Anniversary Offer: ${data.offerTitle} (${data.code})`,
      });
      return { method: 'share' };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return { method: 'share' };
      }
      // If sharing failed for reasons other than user cancellation, fallback to download
    }
  }

  // 2. <a download>
  try {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    return { method: 'download' };
  } catch {
    // 3. Fallback: Open image in new tab
    const objectUrl = URL.createObjectURL(blob);
    window.open(objectUrl, '_blank');
    return { method: 'tab' };
  }
}
