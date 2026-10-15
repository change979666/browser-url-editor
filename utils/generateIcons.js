/**
 * @description 图标生成脚本
 */

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

/**
 * @description 生成指定尺寸的PNG图标
 * @param {number} size - 图标尺寸
 * @returns {Promise<void>}
 */
async function generateIcon(size) {
    // 创建画布
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // 绘制背景圆形
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/2 - 2, 0, Math.PI * 2);
    ctx.fillStyle = '#3498db';
    ctx.fill();

    // 绘制消息气泡
    const bubbleWidth = size * 0.75;
    const bubbleHeight = size * 0.5;
    const bubbleX = (size - bubbleWidth) / 2;
    const bubbleY = (size - bubbleHeight) / 2;

    ctx.beginPath();
    ctx.moveTo(bubbleX, bubbleY);
    ctx.lineTo(bubbleX + bubbleWidth, bubbleY);
    ctx.lineTo(bubbleX + bubbleWidth, bubbleY + bubbleHeight * 0.7);
    ctx.lineTo(size/2, bubbleY + bubbleHeight);
    ctx.lineTo(bubbleX, bubbleY + bubbleHeight * 0.7);
    ctx.closePath();
    ctx.fillStyle = 'white';
    ctx.fill();

    // 绘制文字
    ctx.fillStyle = '#3498db';
    ctx.font = `bold ${size * 0.4}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('A', size/2, size/2);

    // 保存为PNG
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(path.join(__dirname, '..', 'icons', `icon${size}.png`), buffer);
}

/**
 * @description 主函数
 */
async function main() {
    // 确保icons目录存在
    const iconsDir = path.join(__dirname, '..', 'icons');
    if (!fs.existsSync(iconsDir)) {
        fs.mkdirSync(iconsDir);
    }

    // 生成不同尺寸的图标
    const sizes = [16, 48, 128];
    for (const size of sizes) {
        await generateIcon(size);
        console.log(`已生成 ${size}x${size} 图标`);
    }
}

main().catch(console.error); 