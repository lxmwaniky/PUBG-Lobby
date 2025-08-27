/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// Helper function to load an image and return it as an HTMLImageElement
function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        // Setting crossOrigin is good practice for canvas operations, even with data URLs
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = (err) => reject(new Error(`Failed to load image: ${src.substring(0, 50)}...`));
        img.src = src;
    });
}

/**
 * Creates a single "photo album" page image from a collection of character images.
 * @param imageData A record mapping character names to their image data URLs.
 * @returns A promise that resolves to a data URL of the generated album page (JPEG format).
 */
export async function createAlbumPage(imageData: Record<string, string>): Promise<string> {
    const canvas = document.createElement('canvas');
    // High-resolution canvas for good quality (A4-like ratio)
    const canvasWidth = 2480;
    const canvasHeight = 3508;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        throw new Error('Could not get 2D canvas context');
    }

    // 1. Draw the album page background
    ctx.fillStyle = '#111111'; // Dark background
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // 2. Draw the title
    ctx.fillStyle = '#F59E0B'; // PUBG Yellow
    ctx.textAlign = 'center';

    ctx.font = `140px 'Teko', sans-serif`;
    ctx.fillText('PUBG LOBBY', canvasWidth / 2, 160);

    ctx.font = `50px 'Roboto', sans-serif`;
    ctx.fillStyle = '#AAA';
    ctx.fillText('Generated on Google AI Studio', canvasWidth / 2, 230);

    // 3. Load all the images concurrently
    const characters = Object.keys(imageData);
    const loadedImages = await Promise.all(
        Object.values(imageData).map(url => loadImage(url))
    );

    const imagesWithCharacters = characters.map((character, index) => ({
        character,
        img: loadedImages[index],
    }));

    // 4. Define grid layout and draw each player card
    const grid = { cols: 2, rows: 3, padding: 100 };
    const contentTopMargin = 300; // Space for the header
    const contentHeight = canvasHeight - contentTopMargin;
    const cellWidth = (canvasWidth - grid.padding * (grid.cols + 1)) / grid.cols;
    const cellHeight = (contentHeight - grid.padding * (grid.rows + 1)) / grid.rows;

    const cardAspectRatio = 1.25;
    const maxCardWidth = cellWidth * 0.9;
    const maxCardHeight = cellHeight * 0.9;

    let cardWidth = maxCardWidth;
    let cardHeight = cardWidth * cardAspectRatio;

    if (cardHeight > maxCardHeight) {
        cardHeight = maxCardHeight;
        cardWidth = cardHeight / cardAspectRatio;
    }

    const imageContainerWidth = cardWidth * 0.9;
    const imageContainerHeight = imageContainerWidth * 1.1; 

    // Reverse the drawing order: draw bottom rows first so top rows are rendered on top
    const reversedImages = [...imagesWithCharacters].reverse();
    reversedImages.forEach(({ character, img }, reversedIndex) => {
        // Calculate the original index to determine grid position
        const index = imagesWithCharacters.length - 1 - reversedIndex;

        const row = Math.floor(index / grid.cols);
        const col = index % grid.cols;

        // Calculate top-left corner of the card within its grid cell
        const x = grid.padding * (col + 1) + cellWidth * col + (cellWidth - cardWidth) / 2;
        const y = contentTopMargin + grid.padding * (row + 1) + cellHeight * row + (cellHeight - cardHeight) / 2;
        
        ctx.save();
        
        // Translate context to the center of the card for rotation
        ctx.translate(x + cardWidth / 2, y + cardHeight / 2);
        
        // Apply a slight, random rotation for a hand-placed look
        const rotation = (Math.random() - 0.5) * 0.08; // Radians (approx. +/- 2 degrees)
        ctx.rotate(rotation);
        
        // Draw a soft shadow
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 50;
        ctx.shadowOffsetX = 15;
        ctx.shadowOffsetY = 20;
        
        // Draw the dark metallic player card frame with yellow accent
        ctx.fillStyle = '#222';
        ctx.fillRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight);
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 8;
        ctx.strokeRect(-cardWidth / 2, -cardHeight / 2, cardWidth, cardHeight);
        
        // Remove shadow for subsequent drawing
        ctx.shadowColor = 'transparent';
        
        // Calculate image dimensions to fit while maintaining aspect ratio
        const aspectRatio = img.naturalWidth / img.naturalHeight;
        let drawWidth = imageContainerWidth;
        let drawHeight = drawWidth / aspectRatio;

        if (drawHeight > imageContainerHeight) {
            drawHeight = imageContainerHeight;
            drawWidth = drawHeight * aspectRatio;
        }

        // Calculate position to center the image within its container area
        const imageAreaTopMargin = (cardWidth - imageContainerWidth) / 2.5;
        const imageContainerY = -cardHeight / 2 + imageAreaTopMargin;
        
        const imgX = -drawWidth / 2; // Horizontally centered due to context translation
        const imgY = imageContainerY + (imageContainerHeight - drawHeight) / 2;
        
        ctx.drawImage(img, imgX, imgY, drawWidth, drawHeight);
        
        // Draw the caption
        ctx.fillStyle = '#F0F0F0';
        ctx.font = `80px 'Teko', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const captionAreaTop = imageContainerY + imageContainerHeight;
        const captionAreaBottom = cardHeight / 2;
        const captionY = captionAreaTop + (captionAreaBottom - captionAreaTop) / 2;

        ctx.fillText(character, 0, captionY);
        
        ctx.restore(); // Restore context to pre-transformation state
    });

    // Convert canvas to a high-quality JPEG and return the data URL
    return canvas.toDataURL('image/jpeg', 0.9);
}