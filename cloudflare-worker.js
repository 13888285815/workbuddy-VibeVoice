addEventListener("fetch", async function (event) {
  var url = new URL(event.request.url);

  // CORS 预检
  if (event.request.method === "OPTIONS") {
    return event.respondWith(new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    }));
  }

  if (event.request.method !== "POST" || url.pathname !== "/tts") {
    return event.respondWith(new Response("使用 POST /tts 请求", {
      status: 404,
      headers: { "Access-Control-Allow-Origin": "*" },
    }));
  }

  event.respondWith(handleTTS(event.request));
});

async function handleTTS(request) {
  try {
    var body = await request.json();
    var text = body.text;
    var voice = body.voice || "zh-CN-XiaoxiaoNeural";
    var rate = body.rate || "+0%";
    var volume = body.volume || "+0%";
    var pitch = body.pitch || "+0Hz";

    if (!text) {
      return new Response("缺少 text", {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    var TRUSTED_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    var CHROMIUM_VER = "143.0.3650.75";
    var WIN_EPOCH = 11644473600;

    // 生成 Sec-MS-GEC
    var ticks = Math.floor(Date.now() / 1000) + WIN_EPOCH;
    ticks -= ticks % 300;
    ticks *= 1e7;
    var hashBuf = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(ticks.toFixed(0) + TRUSTED_TOKEN)
    );
    var secMsGec = Array.from(new Uint8Array(hashBuf))
      .map(function (b) { return b.toString(16).padStart(2, "0"); })
      .join("")
      .toUpperCase();

    // WebSocket 连接微软
    var connId = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : "a".repeat(32);
    var wsUrl =
      "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=" +
      TRUSTED_TOKEN +
      "&Sec-MS-GEC=" + secMsGec +
      "&Sec-MS-GEC-Version=1-" + CHROMIUM_VER +
      "&ConnectionId=" + connId;

    var audioChunks = [];
    var hasAudio = false;

    var result = await new Promise(function (resolve, reject) {
      var ws = new WebSocket(wsUrl);

      var timer = setTimeout(function () {
        try { ws.close(); } catch (e) {}
        reject(new Error("合成超时"));
      }, 15000);

      ws.addEventListener("open", function () {
        clearTimeout(timer);
        var dateStr = new Date()
          .toUTCString()
          .replace("GMT", "GMT+0000 (Coordinated Universal Time)");

        // 配置消息
        ws.send(
          "X-Timestamp:" + dateStr + "\r\n" +
          "Content-Type:application/json; charset=utf-8\r\n" +
          "Path:speech.config\r\n\r\n" +
          '{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}\r\n'
        );

        // 音色名解析
        var parts = voice.split("-");
        var lang = parts.slice(0, 2).join("-");
        var name = parts.slice(2).join("-");
        var fullVoice = "Microsoft Server Speech Text to Speech Voice (" + lang + ", " + name + ")";

        // SSML（转义 XML 特殊字符）
        var safeText = text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/'/g, "&apos;")
          .replace(/"/g, "&quot;");

        var ssml =
          "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>" +
          "<voice name='" + fullVoice + "'>" +
          "<prosody pitch='" + pitch + "' rate='" + rate + "' volume='" + volume + "'>" +
          safeText +
          "</prosody></voice></speak>";

        ws.send(
          "X-RequestId:" + connId + "\r\n" +
          "Content-Type:application/ssml+xml\r\n" +
          "X-Timestamp:" + dateStr + "Z\r\n" +
          "Path:ssml\r\n\r\n" + ssml
        );
      });

      ws.addEventListener("message", function (event) {
        var data = event.data;
        if (typeof data === "string") {
          if (data.indexOf("Path:turn.end") !== -1) {
            setTimeout(function () {
              try { ws.close(); } catch (e) {}
            }, 500);
          }
        } else {
          var view = new DataView(data);
          if (data.byteLength > 2) {
            var hLen = view.getUint16(0);
            if (data.byteLength > hLen + 2) {
              var audio = data.slice(hLen + 2);
              if (audio.byteLength > 0) {
                audioChunks.push(audio);
                hasAudio = true;
              }
            }
          }
        }
      });

      ws.addEventListener("error", function () {
        clearTimeout(timer);
        reject(new Error("WebSocket 连接失败"));
      });

      ws.addEventListener("close", function () {
        clearTimeout(timer);
        resolve(hasAudio ? new Blob(audioChunks, { type: "audio/mpeg" }) : null);
      });
    });

    if (!result) {
      return new Response("合成失败：未收到音频", {
        status: 500,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    return new Response(result, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Access-Control-Allow-Origin": "*",
        "Content-Disposition": "attachment; filename=\"tts_" + Date.now() + ".mp3\"",
      },
    });
  } catch (e) {
    return new Response(e.message, {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
}
