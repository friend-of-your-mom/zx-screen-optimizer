document.addEventListener('DOMContentLoaded', function () {
  var canvas = document.getElementById('myCanvas');
  var ctx = canvas.getContext('2d');

  var zoomRange = document.getElementById('zoomRange');
  var zoomMin = document.getElementById('zoomMin');
  var zoomMax = document.getElementById('zoomMax');
  var zoomValue = document.getElementById('zoomValue');
  var showAttributes = true;
  var lastHighlighted = null;
  var loadedFileName = '';
  var loadedBytes = new Uint8Array(6912).fill(0);

  var zoomLevel = parseInt(zoomRange.value);
  canvas.width = 256 * zoomLevel;
  canvas.height = 192 * zoomLevel;
  
  updateZoomDisplay();
  drawLoadedData();
  
  zoomRange.addEventListener('input', function () {
    zoomLevel = parseInt(this.value);
    canvas.width = 256 * zoomLevel;
    canvas.height = 192 * zoomLevel;
    updateZoomDisplay();
    drawLoadedData();
  });

  document.querySelector('.load-btn').addEventListener('click', function () {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.scr';
    input.onchange = function (event) {
      var file = event.target.files[0];
      if (file) {
        loadedFileName = file.name;
        var reader = new FileReader();
        reader.onload = function (e) {
          var arrayBuffer = e.target.result;
          var byteArray = new Uint8Array(arrayBuffer);
          var maxSize = 6912;
          loadedBytes = byteArray.slice(0, maxSize);
          drawLoadedData();
        };
        reader.readAsArrayBuffer(file);
      }
    };
    input.click();
  });

  document.querySelector('.save-btn').addEventListener('click', function () {
    if (!loadedBytes.length) {
      alert('No data to save!');
      return;
    }
    var blob = new Blob([loadedBytes.slice(0, 6912)], {type: "application/octet-stream"});
    var url = window.URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = loadedFileName || 'untitled.scr';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  });
  
  document.getElementById('showAttributes').addEventListener('change', function() {
    showAttributes = this.checked;
    drawLoadedData();
  });

  canvas.addEventListener('mousemove', function(event) {
    if (!showAttributes) {
      const rect = canvas.getBoundingClientRect();
      const mouseX = (event.clientX - rect.left) / zoomLevel;
      const mouseY = (event.clientY - rect.top) / zoomLevel;
      const squareWidth = 256 / 32;
      const squareHeight = 192 / 24;
      const blockX = Math.floor(mouseX / squareWidth);
      const blockY = Math.floor(mouseY / squareHeight);
      if (!lastHighlighted || lastHighlighted.x !== blockX || lastHighlighted.y !== blockY) {
        if (lastHighlighted) {
          drawBlock(lastHighlighted.x, lastHighlighted.y);
        }
        highlightBlock(blockX, blockY);
        lastHighlighted = {x: blockX, y: blockY};
      }
    }
  });

  canvas.addEventListener('mouseleave', function() {
    if (lastHighlighted) {
      drawBlock(lastHighlighted.x, lastHighlighted.y);
      lastHighlighted = null;
    }
  });

  canvas.addEventListener('click', function(event) {
    if (!showAttributes) {
      const rect = canvas.getBoundingClientRect();
      const mouseX = (event.clientX - rect.left) / zoomLevel;
      const mouseY = (event.clientY - rect.top) / zoomLevel;
      const squareWidth = 256 / 32;
      const squareHeight = 192 / 24;
      const blockX = Math.floor(mouseX / squareWidth);
      const blockY = Math.floor(mouseY / squareHeight);
      invertBlock(blockX, blockY);
      drawBlock(blockX, blockY);
      highlightBlock(blockX, blockY);
    }
  });

  document.getElementById('showReadme').addEventListener('click', function(event) {
    event.preventDefault();
    fetch('README.md')
      .then(response => response.text())
      .then(text => {
        document.getElementById('readmeContainer').innerHTML = marked.parse(text);
        document.getElementById('readmePopup').style.display = 'block';
      })
      .catch(error => console.error('Error loading README.md:', error));
  });

  document.getElementById('btn-optimize').addEventListener('click', function() {
    const optimizedBlocksCount = optimizeBlocks();
    const message = `Optimized ${optimizedBlocksCount} blocks`;
    document.getElementById('optimizationResult').textContent = message;
    $('#optimizationModal').modal('show');
  });

  document.querySelector('.close').addEventListener('click', function() {
    document.getElementById('readmePopup').style.display = 'none';
  });

  window.addEventListener('beforeunload', function (e) {
    e.preventDefault();
    e.returnValue = '';
    return 'Are you sure you want to leave? You will lose all unsaved data.';
});


  function drawLoadedData() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 32; x++) {
        drawBlock(x, y);
      }
    }
  }
  
  function updateZoomDisplay() {
    zoomValue.textContent = zoomRange.value + 'x';
  }

  function highlightBlock(x, y) {
    const squareWidth = 256 / 32 * zoomLevel;
    const squareHeight = 192 / 24 * zoomLevel;
    ctx.fillStyle = 'rgba(0, 191, 255, 0.5)';
    ctx.fillRect(x * squareWidth, y * squareHeight, squareWidth, squareHeight);
  }

  function invertBlock(x, y) {
    let { loadedBytesOffset, attributeByte } = getOffsetAndAttribute(x, y);
    // Invert data bytes
    for (let i = 0; i < 8; i++) {
      const dataByteOffset = loadedBytesOffset + i * 256;
      let dataByte = loadedBytes[dataByteOffset];
      dataByte = ~dataByte & 0xFF;
      loadedBytes[dataByteOffset] = dataByte;
    }
    // Swap bits 0-2 with bits 3-5 in attributeByte
    const inkBits = attributeByte & 0x07;
    const paperBits = (attributeByte >> 3) & 0x07;
    attributeByte = (inkBits << 3) | paperBits | (attributeByte & 0xC0);
    loadedBytes[6144 + y * 32 + x] = attributeByte;
  }

  function drawBlock(x, y) {
    const { loadedBytesOffset, attributeByte } = getOffsetAndAttribute(x, y);
    for (let i = 0; i < 8; i++) {
      const dataByte = loadedBytes[loadedBytesOffset + i * 256];
      const xStart = x * 8;
      const yStart = y * 8 + i;
      drawByte(dataByte, attributeByte, xStart, yStart);
    }
  }

  function getOffsetAndAttribute(x, y) {
    const areaIndex = Math.trunc(y/8);
    const yAreaOffset = y % 8;
    const loadedBytesOffset = areaIndex * 2048 + yAreaOffset * 32 + x;
    const attributeByte = loadedBytes[6144 + y * 32 + x];
    return { loadedBytesOffset, attributeByte };
  }

  function drawByte(dataByte, attributeByte, xStart, yStart) {
    const colors = getInkAndPaperColors(attributeByte);
    for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
      const bitValue = (dataByte >> (7 - bitIndex)) & 1;
      ctx.fillStyle = bitValue ? colors.ink : colors.paper;
      ctx.fillRect(
        (xStart + bitIndex) * zoomLevel,
        yStart * zoomLevel,
        zoomLevel,
        zoomLevel
      );
    }
  }

  function optimizeBlocks() {
    let optimizedBlocksCount = 0;
    for (let y = 0; y < 24; y++) {
      for (let x = 0; x < 32; x++) {
        const result = optimizeBlock(x, y);
        if (result) {
          optimizedBlocksCount++;
        }
      }
    }
    return optimizedBlocksCount;
  }

  function optimizeBlock(x, y) {
    const { loadedBytesOffset, attributeByte } = getOffsetAndAttribute(x, y);
    const inkCode = attributeByte & 0b00000111;
    const paperCode = (attributeByte & 0b00111000) >> 3;
    if (inkCode !== paperCode) {
      return false;
    }
    let allZero = true;
    let allFF = true;
    for (let i = 0; i < 8; i++) {
      const dataByte = loadedBytes[loadedBytesOffset + i * 256];
      if (dataByte !== 0) allZero = false;
      if (dataByte !== 255) allFF = false;
    }
    if (allZero || allFF) {
      return false;
    }
    for (let i = 0; i < 8; i++) {
      loadedBytes[loadedBytesOffset + i * 256] = 0;
    }
    drawBlock(x, y);
    console.log(`Optimized block at ${x}, ${y}`);
    return true;
  }

  function getInkAndPaperColors(attributeByte) {
    if (!showAttributes) {
      return {
        ink: '#040204',
        paper: '#ccc6cc'
      };
    }

    const brightOn = ['#040204', '#0402ac', '#ec0204', '#fc02dc', '#04ee04', '#04fafc', '#fcfe04', '#fcfafc'];
    const brightOff = ['#040204', '#040284', '#dc0204', '#e402b4', '#04d204', '#04d2d4', '#ccce04', '#ccc6cc'];
    const colorsArray = (attributeByte & 0b01000000) ? brightOn : brightOff;
    const inkCode = attributeByte & 0b00000111;
    const paperCode = (attributeByte & 0b00111000) >> 3;
  
    return {
      ink: colorsArray[inkCode],
      paper: colorsArray[paperCode]
    };
  }
});
