/**
 * EdgeTTS - 浏览器端微软 Edge 在线语音合成
 * 纯原生 JavaScript，无依赖，通过 WebSocket 直连微软语音服务
 */
var EdgeTTS = (function () {
  /* 常量 */
  var TRUSTED_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
  var WSS_BASE = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
  var CHROMIUM_VER = '143.0.3650.75';

  /* 生成连接 ID */
  function 生成ID() {
    return 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'.replace(/[x]/g, function () {
      return (Math.random() * 16 | 0).toString(16);
    });
  }

  /* 生成时间戳字符串 */
  function 时间戳() {
    return new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  }

  /* XML 转义 */
  function 转义XML(文本) {
    return 文本.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;').replace(/"/g, '&quot;');
  }

  /* 生成 Sec-MS-GEC 令牌 */
  function 生成令牌() {
    var ticks = Math.floor(Date.now() / 1000) + 11644473600;
    ticks -= ticks % 300;
    ticks *= 10000000;
    var 输入 = ticks.toFixed(0) + TRUSTED_TOKEN;
    var 编码器 = new TextEncoder();
    var 数据 = 编码器.encode(输入);
    return crypto.subtle.digest('SHA-256', 数据).then(function (哈希缓冲) {
      var 数组 = Array.from(new Uint8Array(哈希缓冲));
      return 数组.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('').toUpperCase();
    });
  }

  /* 构造函数 */
  function 构造(文本, 音色, 选项) {
    this.文本 = 文本 || '';
    this.音色 = 音色 || 'zh-CN-XiaoxiaoNeural';
    var opts = 选项 || {};
    this.速率 = opts.rate || '+0%';
    this.音量 = opts.volume || '+0%';
    this.音调 = opts.pitch || '+0Hz';
  }

  /* 获取完整音色名 */
  function 完整音色名(短名) {
    if (短名.indexOf('Microsoft Server') === 0) return 短名;
    /* 短名格式：zh-CN-XiaoxiaoNeural → (zh-CN, XiaoxiaoNeural) */
    var 第一段 = 短名.substring(0, 短名.indexOf('-', 短名.indexOf('-') + 1));
    var 第二段 = 短名.substring(短名.indexOf('-', 短名.indexOf('-') + 1) + 1);
    return 'Microsoft Server Speech Text to Speech Voice (' + 第一段 + ', ' + 第二段 + ')';
  }

  /* 合成主方法 */
  构造.prototype.synthesize = function () {
    var self = this;
    return 生成令牌().then(function (令牌) {
      return new Promise(function (resolve, reject) {
        var 连接ID = 生成ID();
        var url = WSS_BASE + '?TrustedClientToken=' + TRUSTED_TOKEN +
          '&Sec-MS-GEC=' + 令牌 +
          '&Sec-MS-GEC-Version=1-' + CHROMIUM_VER +
          '&ConnectionId=' + 连接ID;

        var ws;
        try {
          ws = new WebSocket(url);
        } catch (e) {
          reject(new Error('无法创建 WebSocket 连接'));
          return;
        }

        var 音频块 = [];
        var 已收到音频 = false;
        var 超时计时器 = setTimeout(function () {
          reject(new Error('连接超时'));
          if (ws) ws.close();
        }, 30000);

        ws.onopen = function () {
          clearTimeout(超时计时器);

          /* 发送配置 */
          var 配置 = {
            context: {
              synthesis: {
                audio: {
                  metadataoptions: {
                    sentenceBoundaryEnabled: false,
                    wordBoundaryEnabled: false
                  },
                  outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
                }
              }
            }
          };
          var 配置消息 = 'X-Timestamp:' + 时间戳() + '\r\n' +
            'Content-Type:application/json; charset=utf-8\r\n' +
            'Path:speech.config\r\n\r\n' +
            JSON.stringify(配置);
          ws.send(配置消息);

          /* 发送 SSML */
          var 完整音色 = 完整音色名(self.音色);
          var ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='zh-CN'>" +
            "<voice name='" + 完整音色 + "'>" +
            "<prosody pitch='" + self.音调 + "' rate='" + self.速率 + "' volume='" + self.音量 + "'>" +
            转义XML(self.文本) +
            "</prosody></voice></speak>";

          var 请求ID = 生成ID();
          var ssml消息 = 'X-RequestId:' + 请求ID + '\r\n' +
            'Content-Type:application/ssml+xml\r\n' +
            'X-Timestamp:' + 时间戳() + 'Z\r\n' +
            'Path:ssml\r\n\r\n' +
            ssml;
          ws.send(ssml消息);
        };

        ws.onmessage = function (事件) {
          var 数据 = 事件.data;

          if (typeof 数据 === 'string') {
            /* 文本消息（元数据/控制消息），忽略 */
            return;
          }

          if (数据 instanceof Blob) {
            数据.arrayBuffer().then(function (缓冲) {
              var 视图 = new DataView(缓冲);
              if (缓冲.byteLength < 2) return;
              var 头长度 = 视图.getUint16(0);
              if (缓冲.byteLength > 头长度 + 2) {
                var 音频数据 = new Uint8Array(缓冲, 头长度 + 2);
                if (音频数据.length > 0) {
                  音频块.push(音频数据);
                  已收到音频 = true;
                }
              }
            });
          } else if (数据 instanceof ArrayBuffer) {
            var 视图2 = new DataView(数据);
            if (数据.byteLength < 2) return;
            var 头长度2 = 视图2.getUint16(0);
            if (数据.byteLength > 头长度2 + 2) {
              var 音频数据2 = new Uint8Array(数据, 头长度2 + 2);
              if (音频数据2.length > 0) {
                音频块.push(音频数据2);
                已收到音频 = true;
              }
            }
          }
        };

        ws.onerror = function () {
          clearTimeout(超时计时器);
          reject(new Error('WebSocket 连接错误'));
        };

        ws.onclose = function () {
          clearTimeout(超时计时器);
          if (!已收到音频) {
            reject(new Error('未收到音频数据，请检查网络或稍后重试'));
          } else {
            /* 合并所有音频块 */
            var 总长度 = 0;
            for (var i = 0; i < 音频块.length; i++) {
              总长度 += 音频块[i].length;
            }
            var 合并 = new Uint8Array(总长度);
            var 偏移 = 0;
            for (var j = 0; j < 音频块.length; j++) {
              合并.set(音频块[j], 偏移);
              偏移 += 音频块[j].length;
            }
            var blob = new Blob([合并], { type: 'audio/mpeg' });
            resolve({ audio: blob, subtitle: [] });
          }
        };
      });
    });
  };

  return 构造;
})();
