require('dotenv').config();
const ngrok = require('ngrok');
const express = require('express');
const https = require('https');
const fs = require('fs');
const generator = require('generate-password');
const Client = require('castv2-client').Client;
const DefaultMediaReceiver = require('castv2-client').DefaultMediaReceiver;
const VoiceText = require('voicetext');

const app = express();

app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use(function(req, res, next) {
    res.removeHeader('X-Powered-By');
    res.removeHeader('ETag');
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});
  
const filepath = fs.mkdtempSync('/tmp/hometalk') + '/voicetext.mp3';

app.listen(3000, () => console.log('Listening on port 3000'));

const ngrok_user = process.env.NGROK_USER;
const ngrok_password = generator.generate({
    length: 32,
    numbers: true,
    symbols: true,
    lowercase: true,
    uppercase: true,
    exclude: '!@#$%^&*()+-=}{[\]|:;"/?.><,`~',
    strict: true,
});
(async () => {
    const url = await ngrok.connect({
        proto: 'http',
        addr: 3000,
        auth: `${ngrok_user}:${ngrok_password}`,
        authtoken: process.env.NGROK_AUTHTOKEN,
        region: 'jp'
    });
    const auth_url = new URL(url);
    auth_url.username = ngrok_user;
    auth_url.password = ngrok_password;
    console.log(auth_url.href + 'speech');
})();

app.post('/speech', (req, res) => {
    if (req.body.challenge) {
        res.write(req.body.challenge);
        res.end();
    } else if (req.body.event.text) {
        const text = req.body.event.text.replace(/<@\w+>|:\w+:/, '');
        voicetext(text)
        .then(() => {
            speechHome();
            res.end();
        });
    }
});

app.get('/voicetext.mp3', (req, res) => {
    const file = fs.readFileSync(filepath);
    res.header({
        'Content-Type': 'audio/mpeg',
        'Content-Length': file.length
    });
    res.write(file);
    res.end();
});

function voicetext(text) {
    const voice = new VoiceText(process.env.VOICETEXT_API_KEY);
    return new Promise((resolve, reject) => {
        voice
        .speaker(voice.SPEAKER.HIKARI)
        .emotion(voice.EMOTION.HAPPINESS)
        .emotion_level(voice.EMOTION_LEVEL.HIGH)
        .speed(110)
        .format('mp3')
        .speak(text, (e, buf) => {
            if (e) {
                console.error(e);
                reject(e);
            } else {
                fs.writeFileSync(filepath, buf);
                resolve();
            }
        });
    });
}

function speechHome() {
    const client = new Client();
    const host = process.env.GOOGLE_HOME_HOST;
    const url = process.env.APP_BASE_URL + '/voicetext.mp3'
    client.connect(host, function () {
        client.launch(DefaultMediaReceiver, function (e, player) {
            if (e) {
                console.log(e);
                return;
            }

            player.on('status', function (status) {
                console.log(`status broadcast playerState=${status.playerState} content=${url}`);
            });

            const media = {
                contentId: url,
                contentType: 'audio/mpeg',
                streamType: 'BUFFERED'
            };
            player.load(media, { autoplay: true }, function (e, status) {
                client.close();
            });
        });
    });
    client.on('error', function (e) {
        console.log(`Error: ${e.message}, host: ${host}, url: ${url}`);
        client.close();
    });
}