const fs = require('fs');

const memoryAttr = {
  pageFrame: 32,
  pageNumber: 64,
  pageSize: 16384,
  get virtualMemSize() {
    return this.pageSize * this.pageNumber;
  },
  get physicalMemSize() {
    return this.pageSize * this.pageFrame;
  },
};
const loadBtn = document.querySelector('#load-simulation');
const errorMsg = document.querySelector('#error-msg');
const simulationSection = document.getElementById('simulation');
const startSection = document.getElementById('start-section');
const virtualMemTable = document.getElementById('virual-memory');
const physicalMemTable = document.getElementById('physical-memory');
const LRUpage = document.getElementById('LRUpage');
const MRUpage = document.getElementById('MRUpage');
const lblStatus = document.getElementById('status');
const lblTime = document.getElementById('current-time');
const lblInstruction = document.getElementById('instruction');
const lblDirection = document.getElementById('direction');
const lblPageFail = document.getElementById('page-fail');
const lblVirtualPage = document.getElementById('virtual-page');
const lblPhysicalPage = document.getElementById('physical-page');
const lblRbit = document.getElementById('R-bit');
const lblMbit = document.getElementById('M-bit');
const lblMemoryTime = document.getElementById('memoryTime');
const lblLastUpdate = document.getElementById('lastUpdate');
const lblLow = document.getElementById('low');
const lblHigh = document.getElementById('high');
let commands = [];
let memoryConfig = [];
let startTimeInms = 0;
let pages = [];
let temporaryPages = [];
let temporaryCommands = [];
let LRUList = [];
let temporaryLRUList = [];
let outputStatusLines = '';

function randomMax(max) {
  // Does not include the maximum
  return Math.floor(Math.random() * max);
}

class Command {
  constructor(statement, ...address) {
    this.statement = statement.toUpperCase();
    const BASES = {
      bin: 2,
      hex: 16,
      oct: 8,
    };
    const stringBase = address[1]?.toLowerCase() || null;
    this.base = BASES[stringBase] || 10;
    if (address[0] === 'random') {
      this.address = randomMax(memoryAttr.virtualMemSize);
    }
    if (this.address == null) this.address = parseInt(address[0], this.base);
  }
}

const clearSpacesAndComments = (element) => {
  const elementCleaned = /^\/\/.+/.test(element.trim()) ? '' : element.trim();
  return elementCleaned;
};

const slipAndCleanString = (string) => {
  const stringSplited = string.split('\n').map(clearSpacesAndComments).filter(Boolean);
  return stringSplited;
};

const filterSplitCommands = (unfilteredCommands) => {
  const regexCommands = /^(READ|WRITE) (RANDOM|BIN [0-1]+|HEX [0-9A-F]+|OCT [0-7]+|[0-9]+)$/i;
  return unfilteredCommands
    .filter((line) => regexCommands.test(line))
    .map((e) => e.split(' '));
};

const filerSplitMemSettings = (memSettings) => {
  const regexSettings = /^(MEMSET( [0-9]*){6}|PAGESIZE [0-9]*|PAGENUM [0-9]*|PAGEFRAME [0-9]*)$/i;
  return memSettings
    .filter((line) => regexSettings.test(line))
    .map((e) => e.split(' '));
};

const loadAttributes = (dataMemoryConfig) => {
  let pagesWereLoaded = false;
  let framesWereLoaded = false;
  let pageSizeWereLoaded = false;
  dataMemoryConfig.forEach((statement) => {
    if (/^PAGESIZE/i.test(statement[0]) && !pageSizeWereLoaded) {
      memoryAttr.pageSize = parseInt(statement[1], 10);
      pageSizeWereLoaded = true;
    }
    if (/^PAGENUM/i.test(statement[0]) && !pagesWereLoaded) {
      memoryAttr.pageNumber = parseInt(statement[1], 10);
      pagesWereLoaded = true;
    }
    if (/^PAGEFRAME/i.test(statement[0]) && !framesWereLoaded) {
      memoryAttr.pageFrame = parseInt(statement[1], 10);
      framesWereLoaded = true;
    }
  });
};

function validatesMemoryAttributes() {
  if (memoryAttr.pageFrame > memoryAttr.pageNumber) {
    errorMsg.innerHTML = `There cannot be more memory frames than the number of virtual pages: pageframe = ${memoryAttr.pageFrame} > pagenum: ${memoryAttr.pageNumber}`;
    return false;
  }
  return true;
}

function validateMemsets() {
  for (const statement of memoryConfig) {
    if (/^MEMSET/i.test(statement[0])) {
      const virtualPage = parseInt(statement[1], 10);
      const physicalPage = parseInt(statement[2], 10);
      if (virtualPage >= memoryAttr.pageNumber) {
        errorMsg.innerHTML = `There cannot be memset instructions with page numbers with the number greater than or equal to the maximum page numbers: memset ${virtualPage} ${physicalPage}, max. pages = ${memoryAttr.pageNumber}`;
        return false;
      }
      if (physicalPage >= memoryAttr.pageFrame) {
        errorMsg.innerHTML = `There cannot be memset instructions with page frames with the number greater than or equal to the maximum number of page frames: memset ${virtualPage} ${physicalPage}, max. pages = ${memoryAttr.pageFrame}`;
        return false;
      }
    }
  }
  return true;
}

function totalMilisecondsOfToday() {
  const now = new Date();
  return (
    now.getHours() * 60 * 60 * 1000
    + now.getMinutes() * 60 * 1000
    + now.getSeconds() * 1000
    + now.getMilliseconds()
  );
}

function initPages() {
  pages = [];
  startTimeInms = totalMilisecondsOfToday();
  for (let i = 0; i < memoryAttr.pageNumber; i += 1) {
    pages.push({
      virualPage: i,
      physicalPage: -1,
      Rbit: false,
      Mbit: false,
      memoryEntryTime: startTimeInms,
      lastReferenceTime: startTimeInms,
      get inMemTime() {
        return totalMilisecondsOfToday() - this.memoryEntryTime;
      },
      get lastTouch() {
        return totalMilisecondsOfToday() - this.lastReferenceTime;
      },
      low: i * memoryAttr.pageSize,
      high: (i + 1) * memoryAttr.pageSize - 1,
    });
  }
}

function indexIfPageFrameExist(numPhysicalPage) {
  const page = pages.find((tempPage) => tempPage.physicalPage === numPhysicalPage);
  return page?.virtualPage || -1;
}

function validateDuplicatedMemsets() {
  let valid = true;
  for (const statement of memoryConfig) {
    if (/^MEMSET/i.test(statement[0])) {
      const pageNumber = parseInt(statement[1], 10);
      const physicalPage = parseInt(statement[2], 10);
      const indexPageFrame = indexIfPageFrameExist(physicalPage);
      if (indexPageFrame !== -1) {
        errorMsg.innerHTML = `There cannot be memset statements with duplicate or twice assigned page frames: memset ${indexPageFrame} ${pages[indexPageFrame].physicalPage}, memset ${pageNumber} ${physicalPage}`;
        valid = false; break;
      } else if (pages[pageNumber].physicalPage !== -1) {
        errorMsg.innerHTML = `There can be no memset statements with duplicate page numbers: memset ${pageNumber} ${pages[pageNumber].physicalPage}, memset ${pageNumber} ${statement[2]}`;
        valid = false; break;
      } else {
        pages[pageNumber].virualPage = pageNumber;
        pages[pageNumber].physicalPage = physicalPage;
        pages[pageNumber].Rbit = statement[3] === '1';
        pages[pageNumber].Mbit = statement[4] === '1';
        pages[pageNumber].memoryEntryTime -= parseInt(statement[5], 10);
        if (parseInt(statement[5], 10) >= parseInt(statement[6], 10)) {
          const entryTime = pages[pageNumber].memoryEntryTime;
          pages[pageNumber].lastReferenceTime = entryTime - parseInt(statement[6], 10);
        } else {
          errorMsg.innerHTML = `There cannot be a last reference time greater than the time it has been in memory: memset ${pageNumber} ${pages[pageNumber].physicalPage} ${statement[3]} ${statement[4]} ${statement[5]} ${statement[6]}`;
          valid = false; break;
        }
      }
    }
  }
  return valid;
}

function validateCommands() {
  for (const command of commands) {
    if (command.address >= memoryAttr.virtualMemSize) {
      const address = command.base !== 10 ? `(${command.address.toString(command.base).toUpperCase()})` : '';
      errorMsg.innerHTML = `There cannot be commands with virtual page numbers greater than or equal to the virtual memory size: ${command.statement} ${command.address} ${address} memory size: ${memoryAttr.virtualMemSize} bytes,`;
      return false;
    }
  }
  return true;
}

function validateData() {
  if (!validatesMemoryAttributes()) return false;
  if (!validateMemsets()) return false;
  initPages();
  if (!validateDuplicatedMemsets()) return false;
  if (!validateCommands()) return false;
  return true;
}

function createLRUList() {
  LRUList = pages.slice();
  LRUList.sort((pageA) => pageA.physicalPage);
  LRUList.sort((pageA, pageB) => {
    if (pageA.lastTouch > pageB.lastTouch) {
      return 1;
    }
    if (pageA.lastTouch < pageB.lastTouch) {
      return -1;
    }
    // They are equal
    return -1;
  });
  while (true) {
    let lastNoValid = -1;
    LRUList.forEach((element, index) => {
      if (element.physicalPage === -1) {
        lastNoValid = index;
      }
    });
    if (lastNoValid === -1) {
      break;
    }
    LRUList.splice(lastNoValid, 1);
  }
}

function switchStartSimulationWindow(start, simulation) {
  startSection.style.display = start;
  simulationSection.style.display = simulation;
}

function loadVirtualMemoryTable() {
  let pagesElem = '<p class="title">Virtual memory page table</p>\n';
  let frames = '<p class="title">Physical memory page table</p>';
  const pageOnFrame = [];
  for (let frame = 0; frame < memoryAttr.pageFrame; frame += 1) {
    pageOnFrame.push(-1);
  }

  for (const page of temporaryPages) {
    pagesElem += `<button class='page' onclick='loadPageInformation(${page.virualPage})'>${page.virualPage}</button>\n`;
    if (page.physicalPage !== -1) pageOnFrame[page.physicalPage] = page.virualPage;
  }
  pageOnFrame.forEach((page, index) => {
    frames += page === -1 ?
      `<p class='frame'>${index}</p>` :
      `<p class='frame'>${index}<br> Virtual Page: ${page}</p>`;
  });

  virtualMemTable.innerHTML = pagesElem;
  physicalMemTable.innerHTML = frames;
}

loadBtn.addEventListener('click', () => {
  try {
    const strMemoryConfig = fs.readFileSync('memory.conf').toString();
    const strCommands = fs.readFileSync('commands.conf').toString();
    memoryConfig = filerSplitMemSettings(slipAndCleanString(strMemoryConfig));
    loadAttributes(memoryConfig);
    const comandsCleaned = filterSplitCommands(slipAndCleanString(strCommands));
    commands = comandsCleaned.map((element) => {
      if (element.length === 2) return new Command(element[0], element[1]);
      return new Command(element[0], element[2], element[1]);
    });
    if (validateData()) {
      createLRUList();
      switchStartSimulationWindow('none', 'block');
      temporaryLRUList = LRUList.slice();
      temporaryPages = pages.slice();
      temporaryCommands = commands.slice();
      loadVirtualMemoryTable();
      outputStatusLines = '';
      lblStatus.innerHTML = 'STOP';
      lblInstruction.innerHTML = 'Null';
      lblPageFail.innerHTML = 'There is not any yet';
    }
  } catch (err) {
    errorMsg.innerHTML = `An error occurred while loading configuration files ${err}`;
  }
});

const exitBtn = document.getElementById('salir');
const executeBtn = document.getElementById('run');
const resetBtn = document.getElementById('reset');
const stepBtn = document.getElementById('step-by-step');
let simulationStatus = 'STOP';
let lastInstruction = 'null';
let lastFail = 'There is not any yet';
let lastDirection = '';

exitBtn.addEventListener('click', () => {
  switchStartSimulationWindow('block', 'none');
  executeBtn.disabled = false;
  stepBtn.disabled = false;
});

function loadPageInformation(page) {
  lblStatus.innerHTML = simulationStatus;
  lblInstruction.innerHTML = lastInstruction;
  lblPageFail.innerHTML = lastFail;
  lblDirection.innerHTML = lastDirection;
  lblTime.innerHTML = totalMilisecondsOfToday() - startTimeInms;
  lblVirtualPage.innerHTML = temporaryPages[page].virualPage;
  lblPhysicalPage.innerHTML = temporaryPages[page].physicalPage;
  if (temporaryPages[page].lastTouch > 10000) temporaryPages[page].Rbit = 0;
  lblRbit.innerHTML = temporaryPages[page].Rbit ? 1 : 0;
  lblMbit.innerHTML = temporaryPages[page].Mbit ? 1 : 0;
  lblMemoryTime.innerHTML = temporaryPages[page].inMemTime;
  lblLastUpdate.innerHTML = temporaryPages[page].lastTouch;
  lblLow.innerHTML = temporaryPages[page].low;
  lblHigh.innerHTML = temporaryPages[page].high;
  LRUpage.innerHTML =
    temporaryLRUList.length === 0 ?
      '(-1,-1)' :
      `(${temporaryLRUList[temporaryLRUList.length - 1].physicalPage},${
        temporaryLRUList[temporaryLRUList.length - 1].virualPage
      })`;
  MRUpage.innerHTML =
    temporaryLRUList.length === 0 ?
      '(-1,-1)' :
      `(${temporaryLRUList[0].physicalPage},${temporaryLRUList[0].virualPage})`;
}

function writeOutputFiles() {
  fs.writeFileSync('tracefile.txt', outputStatusLines);
}

resetBtn.addEventListener('click', () => {
  validateData();
  writeOutputFiles();
  outputStatusLines = '';
  temporaryLRUList = LRUList.slice();
  temporaryPages = pages.slice();
  temporaryCommands = commands.slice();
  loadVirtualMemoryTable();
  lblStatus.innerHTML = 'STOP';
  lblInstruction.innerHTML = 'Null';
  lblPageFail.innerHTML = 'There is not any yet';
  lblTime.innerHTML = '';
  lblVirtualPage.innerHTML = '';
  lblPhysicalPage.innerHTML = '';
  lblRbit.innerHTML = '';
  lblMbit.innerHTML = '';
  lblMemoryTime.innerHTML = '';
  lblLastUpdate.innerHTML = '';
  lblLow.innerHTML = '';
  lblHigh.innerHTML = '';
  executeBtn.disabled = false;
  stepBtn.disabled = false;
});

function executeOneInstruction() {
  const currCommand = temporaryCommands.shift();
  let asignedFrame;
  const currTime = totalMilisecondsOfToday();
  const pageNumber = Math.trunc(currCommand.address / memoryAttr.pageSize);
  lastFail = '';
  lastInstruction = currCommand.statement;
  lastDirection = currCommand.address;
  outputStatusLines += `${lastInstruction} ${lastDirection.toString(currCommand.base)} ...`;
  if (temporaryPages[pageNumber].physicalPage === -1) {
    temporaryPages[pageNumber].tiempoEntradaAMemoria = currTime;
    lastFail += 'There was failure';
    outputStatusLines += ' page fault\n';
    if (temporaryLRUList.length === memoryAttr.pageFrame) {
      const pageThatComesOUt = temporaryLRUList.pop();
      asignedFrame = pages[pageThatComesOUt.virualPage].physicalPage;
      pages[pageThatComesOUt.virualPage].physicalPage = -1;
      lastFail += `, page ${pageThatComesOUt.virualPage} comes out`;
    } else {
      for (asignedFrame = 0; asignedFrame < memoryAttr.pageFrame; asignedFrame += 1) {
        let asigned = false;
        for (const pag of temporaryPages) {
          if (asignedFrame === pag.physicalPage) asigned = true;
        }
        if (asigned === false) break;
      }
    }
  } else {
    outputStatusLines += ' ok\n';
    lastFail += 'Nothing happened';
    let tempLRUpage;
    for (tempLRUpage = 0; tempLRUpage < temporaryLRUList.length; tempLRUpage += 1) {
      if (temporaryLRUList[tempLRUpage].virualPage === pageNumber) break;
    }
    temporaryLRUList.splice(tempLRUpage, 1);
    asignedFrame = temporaryPages[pageNumber].physicalPage;
  }
  temporaryLRUList.unshift(temporaryPages[pageNumber]);
  temporaryPages[pageNumber].physicalPage = asignedFrame;
  temporaryPages[pageNumber].Rbit = true;
  temporaryPages[pageNumber].tiempoUltimaReferencia = currTime;
  temporaryPages[pageNumber].Mbit = /^WRITE$/i.test(currCommand.statement);
  loadPageInformation(pageNumber);
}

stepBtn.addEventListener('click', () => {
  simulationStatus = 'STEP';
  executeOneInstruction();
  loadVirtualMemoryTable();
  if (temporaryCommands.length === 0) {
    stepBtn.disabled = true;
    executeBtn.disabled = true;
    writeOutputFiles();
  }
});

executeBtn.addEventListener('click', () => {
  simulationStatus = 'RUN';
  while (temporaryCommands.length !== 0) executeOneInstruction();
  loadVirtualMemoryTable();
  writeOutputFiles();
  executeBtn.disabled = true;
  stepBtn.disabled = true;
});
