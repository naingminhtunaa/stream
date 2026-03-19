const express = require('express');
const cors = require('cors');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 8080;

// CORS ဖွင့်ပေးခြင်းဖြင့် React App မှ လှမ်းခေါ်နိုင်မည်
app.use(cors());

// HLS (.m3u8 နှင့် .ts) ဖိုင်များ သိမ်းဆည်းရန် ဖိုင်တွဲ
const HLS_DIR = path.join(__dirname, 'public', 'hls');

// ဖိုင်တွဲမရှိပါက အသစ်တည်ဆောက်မည်
if (!fs.existsSync(HLS_DIR)) {
    fs.mkdirSync(HLS_DIR, { recursive: true });
}

// m3u8 နှင့် ts ဖိုင်များကို App ဘက်မှ လှမ်းယူနိုင်ရန် Static အဖြစ် ကြေညာခြင်း
app.use('/hls', express.static(HLS_DIR));

const activeProcesses = new Map();

// အဓိက HLS ပြောင်းပေးမည့် API Endpoint
app.get('/play', (req, res) => {
    const videoUrl = req.query.url;
    if (!videoUrl) {
        return res.status(400).send('Missing "url" parameter. Example: /play?url=YOUR_MP4_URL');
    }

    // Video URL ကို အသုံးပြု၍ သီးသန့် ID တစ်ခု ဖန်တီးခြင်း
    const streamId = crypto.createHash('md5').update(videoUrl).digest('hex');
    const streamDir = path.join(HLS_DIR, streamId);
    const m3u8Path = path.join(streamDir, 'index.m3u8');
    const streamUrl = `/hls/${streamId}/index.m3u8`;

    // Process လုပ်နေဆဲ (သို့) .m3u8 ဖိုင် ရှိနေပြီးသားဆိုလျှင် အသစ်ထပ်မလုပ်ဘဲ လင့်ခ်ကိုသာ ပြန်ပေးမည်
    if (fs.existsSync(m3u8Path) || activeProcesses.has(streamId)) {
        return res.redirect(streamUrl);
    }

    // Stream အတွက် Folder အသစ်တည်ဆောက်ခြင်း
    fs.mkdirSync(streamDir, { recursive: true });

    console.log(`Starting FFmpeg for: ${videoUrl}`);

    // FFmpeg ဖြင့် MP4 ကို HLS သို့ Remux လုပ်ခြင်း (CPU မစားစေရန် -c copy ကိုသာ သုံးထားသည်)
    const command = ffmpeg(videoUrl)
        .outputOptions([
            '-c:v copy',        // Video ကို Transcode မလုပ်ဘဲ မူရင်းအတိုင်း ကူးယူရန်
            '-c:a copy',        // Audio ကို Transcode မလုပ်ဘဲ မူရင်းအတိုင်း ကူးယူရန်
            '-hls_time 10',     // တစ်ပိုင်းလျှင် ၁၀ စက္ကန့်ခွဲရန်
            '-hls_list_size 0', // Playlist တွင် အပိုင်းအားလုံးကို ပြရန်
            '-f hls'            // HLS Format အဖြစ်ထုတ်ရန်
        ])
        .output(m3u8Path)
        .on('start', (cmd) => {
            console.log('FFmpeg started successfully.');
        })
        .on('end', () => {
            console.log('FFmpeg finished for:', streamId);
            activeProcesses.delete(streamId);
        })
        .on('error', (err) => {
            console.error('FFmpeg error:', err.message);
            activeProcesses.delete(streamId);
        });

    activeProcesses.set(streamId, command);
    command.run(); // FFmpeg Process ကို စတင်ပါမည်

    // Command စတင်ပြီးပြီးချင်း HLS URL သို့ Redirect လုပ်ပါမည်။
    res.redirect(streamUrl);
});

// Server Disk မပြည့်စေရန် ၂ နာရီကျော်သွားသော Stream Folder များကို ဖျက်ပေးမည့် Cron Job
setInterval(() => {
    const now = Date.now();
    fs.readdir(HLS_DIR, (err, files) => {
        if (err) return console.error('Cleanup read error:', err);
        files.forEach(folder => {
            const folderPath = path.join(HLS_DIR, folder);
            fs.stat(folderPath, (err, stats) => {
                if (err) return;
                // ၂ နာရီ (2 hours) ထက်ကျော်လွန်နေသော Folder များကို ဖျက်မည်
                if (now - stats.mtimeMs > 2 * 60 * 60 * 1000) {
                    fs.rm(folderPath, { recursive: true, force: true }, (err) => {
                        if (!err) console.log(`Cleaned up old stream: ${folder}`);
                    });
                }
            });
        });
    });
}, 60 * 60 * 1000); // ၁ နာရီ တစ်ခါ စစ်ဆေးမည်

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
