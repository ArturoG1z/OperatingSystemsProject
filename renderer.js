let fs = require("fs");
const { dialog } = require("electron");
const { join } = require("path");
let memoryAttr = {
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

const loadBtn = document.querySelector("#load-simulation");
let commands = [],
	memoryConfig = [];
const errorMsg = document.querySelector("#error-msg"),
	successMsg = document.querySelector("#success-msg");
const simulationSection = document.getElementById("simulation");
const startSection = document.getElementById("start-section");
const virtualMemTable = document.getElementById("virual-memory");
const physicalMemTable = document.getElementById("physical-memory");
const LRUpage = document.getElementById("LRUpage");
const MRUpage = document.getElementById("MRUpage");
let startTimeIn_ms = 0;
let pages = [],
	temporaryPages = [];
let temporaryCommands = [];
let LRUList = [],
	temporaryLRUList = [];
let outputStatusLines = "";
const lbl_status = document.getElementById("status");
const lbl_time = document.getElementById("current-time");
const lbl_instruction = document.getElementById("instruction");
const lbl_direction = document.getElementById("direction");
const lbl_pageFail = document.getElementById("page-fail");
const lbl_virtualPage = document.getElementById("virtual-page");
const lbl_physicalPage = document.getElementById("physical-page");
const lbl_Rbit = document.getElementById("R-bit");
const lbl_Mbit = document.getElementById("M-bit");
const lbl_memoryTime = document.getElementById("memoryTime");
const lbl_lastUpdate = document.getElementById("lastUpdate");
const lbl_low = document.getElementById("low");
const lbl_high = document.getElementById("high");

function randomMax(max) {
	// Does not include the maximum
	return Math.floor(Math.random() * max);
}

class Command {
	constructor(statement, ...address) {
		this.statement = statement.toUpperCase();
		if (address.length == 2)
			this.base =
			address[1].toLowerCase() == "bin" ?
			2 :
			address[1].toLowerCase() == "hex" ?
			16 :
			8;
		else {
			this.base = 10;
			if (address[0] == "random")
				this.address = randomMax(memoryAttr.virtualMemSize);
		}
		if (this.address == null) this.address = parseInt(address[0], this.base);
	}
}

let clearSpacesAndComments = (element) => {
	return /^\/\/.+/.test(element.trim()) ? "" : element.trim();
};

let slipAndCleanString = (string) => {
	return string.split("\n").map(clearSpacesAndComments).filter(Boolean);
};

let filterSplitCommands = (commands) => {
	let regexCommands =
		/^(READ|WRITE) (RANDOM|BIN [0-1]+|HEX [0-9A-F]+|OCT [0-7]+|[0-9]+)$/i;
	return commands
		.filter((line) => regexCommands.test(line))
		.map((e) => e.split(" "));
};

let filerSplitMemSettings = (memSettings) => {
	let regexSettings =
		/^(MEMSET( [0-9]*){6}|PAGESIZE [0-9]*|PAGENUM [0-9]*|PAGEFRAME [0-9]*)$/i;
	return memSettings
		.filter((line) => regexSettings.test(line))
		.map((e) => e.split(" "));
};

let loadAttributes = (dataMemoryConfig) => {
	let loadedSize = (leadedPages = loadedFrames = false);
	for (const statement of dataMemoryConfig) {
		if (/^PAGESIZE/i.test(statement[0]) && !loadedSize) {
			memoryAttr.pageSize = parseInt(statement[1]);
			loadedSize = true;
		}
		if (/^PAGENUM/i.test(statement[0]) && !leadedPages) {
			memoryAttr.pageNumber = parseInt(statement[1]);
			leadedPages = true;
		}
		if (/^PAGEFRAME/i.test(statement[0]) && !loadedFrames) {
			memoryAttr.pageFrame = parseInt(statement[1]);
			loadedFrames = true;
		}
	}
};

function validateData() {
	if (!validatesMemoryAttributes()) return false;
	if (!validateMemsets()) return false;
	initPages();
	if (!validateDuplicatedMemsets()) return false;
	if (!validateCommands()) return false;
	return true;
}

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
			if (parseInt(statement[1]) >= memoryAttr.pageNumber) {
				errorMsg.innerHTML = `There cannot be memset instructions with page numbers with the number greater than or equal to the maximum page numbers: memset ${statement[1]} ${statement[2]}, max. pages = ${memoryAttr.pageNumber}`;
				return false;
			}
			if (parseInt(statement[2]) >= memoryAttr.pageFrame) {
				errorMsg.innerHTML = `There cannot be memset instructions with page frames with the number greater than or equal to the maximum number of page frames: memset ${statement[1]} ${statement[2]}, max. pages = ${memoryAttr.pageFrame}`;
				return false;
			}
		}
	}
	return true;
}

function initPages() {
	pages = [];
	startTimeIn_ms = totalMilisecondsOfToday();
	for (let i = 0; i < memoryAttr.pageNumber; i++) {
		pages.push({
			virualPage: i,
			physicalPage: -1,
			Rbit: false,
			Mbit: false,
			memoryEntryTime: startTimeIn_ms,
			lastReferenceTime: startTimeIn_ms,
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

function validateDuplicatedMemsets() {
	for (const statement of memoryConfig) {
		if (/^MEMSET/i.test(statement[0])) {
			let pageNumber = parseInt(statement[1]);
			let physicalPage = parseInt(statement[2]);
			let indexPageFrame = indexIfPageFrameExist(physicalPage);
			if (indexPageFrame != -1) {
				errorMsg.innerHTML = `There cannot be memset statements with duplicate or twice assigned page frames: memset ${indexPageFrame} ${pages[indexPageFrame].physicalPage}, memset ${pageNumber} ${physicalPage}`;
				return false;
			} else if (pages[pageNumber].physicalPage != -1) {
				errorMsg.innerHTML = `There can be no memset statements with duplicate page numbers: memset ${pageNumber} ${pages[pageNumber].physicalPage}, memset ${pageNumber} ${statement[2]}`;
				return false;
			} else {
				pages[pageNumber].virualPage = pageNumber;
				pages[pageNumber].physicalPage = physicalPage;
				pages[pageNumber].Rbit = statement[3] == "1" ? true : false;
				pages[pageNumber].Mbit = statement[4] == "1" ? true : false;
				pages[pageNumber].memoryEntryTime =
					pages[pageNumber].memoryEntryTime - parseInt(statement[5]);
				if (parseInt(statement[5]) >= parseInt(statement[6])) {
					pages[pageNumber].lastReferenceTime =
						pages[pageNumber].memoryEntryTime - parseInt(statement[6]);
				} else {
					errorMsg.innerHTML = `There cannot be a last reference time greater than the time it has been in memory: memset ${pageNumber} ${pages[pageNumber].physicalPage} ${statement[3]} ${statement[4]} ${statement[5]} ${statement[6]}`;
					return false;
				}
			}
		}
	}
	return true;
}

function indexIfPageFrameExist(numphysicalPage) {
	for (const page of pages) {
		if (page.physicalPage == numphysicalPage) {
			return page.virualPage;
		}
	}
	return -1;
}

function validateCommands() {
	for (const command of commands) {
		if (command.address >= memoryAttr.virtualMemSize) {
			errorMsg.innerHTML = `There cannot be commands with virtual page numbers greater than or equal to the virtual memory size: ${
				command.statement
			} ${command.address} ${
				command.base != 10
					? `(${command.address.toString(command.base).toUpperCase()})`
					: ""
			} memory size: ${memoryAttr.virtualMemSize} bytes,`;
			return false;
		}
	}
	return true;
}

function totalMilisecondsOfToday() {
	let ahora = new Date();
	return (
		ahora.getHours() * 60 * 60 * 1000 +
		ahora.getMinutes() * 60 * 1000 +
		ahora.getSeconds() * 1000 +
		ahora.getMilliseconds()
	);
}

function createLRUList() {
	LRUList = pages.slice();
	LRUList.sort((pageA, pageB) => pageA.physicalPage);
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
	let arePagesWithoutLoading = true;
	while (true) {
		let lastNoValid = -1;
		LRUList.forEach((element, index) => {
			if (element.physicalPage == -1) {
				lastNoValid = index;
			}
		});
		if (lastNoValid == -1) break;
		LRUList.splice(lastNoValid, 1);
	}
}

function switchStartSimulationWindow(start, simulation) {
	startSection.style.display = start;
	simulationSection.style.display = simulation;
}

function loadVirtualMemoryTable() {
	let pages = '<p class="title">Virtual memory page table</p>\n',
		frames = '<p class="title">Physical memory page table</p>',
		pageOnFrame = [];
	for (let frame = 0; frame < memoryAttr.pageFrame; frame++) {
		pageOnFrame.push(-1);
	}

	for (let page of temporaryPages) {
		pages += `<button class="page" onclick="loadPageInformation(${page.virualPage})">${page.virualPage}</button>\n`;
		if (page.physicalPage != -1)
			pageOnFrame[page.physicalPage] = page.virualPage;
	}
	pageOnFrame.forEach((page, index) => {
		frames +=
			page == -1
				? `<p class="frame">${index}</p>`
				: `<p class="frame">${index}<br> Virtual Page: ${page}</p>`;
	});

	virtualMemTable.innerHTML = pages;
	physicalMemTable.innerHTML = frames;
}

loadBtn.addEventListener("click", () => {
	try {
		let strMemoryConfig = fs.readFileSync("memory.conf").toString();
		(strComands = fs.readFileSync("commands.conf").toString()),
			(memoryConfig = filerSplitMemSettings(
				slipAndCleanString(strMemoryConfig)
			));
		loadAttributes(memoryConfig);
		commands = filterSplitCommands(slipAndCleanString(strComands)).map(
			(element) =>
				element.length == 2
					? new Command(element[0], element[1])
					: new Command(element[0], element[2], element[1])
		);
		if (validateData()) {
			createLRUList();
			switchStartSimulationWindow("none", "block");
			temporaryLRUList = LRUList.slice();
			temporaryPages = pages.slice();
			temporaryCommands = commands.slice();
			loadVirtualMemoryTable();
			outputStatusLines = "";
			lbl_status.innerHTML = "STOP";
			lbl_instruction.innerHTML = "Null";
			lbl_pageFail.innerHTML = "There is not any yet";
		}
	} catch (err) {
		errorMsg.innerHTML = `An error occurred while loading configuration files ${err}`;
	}
});

let exitBtn = document.getElementById("salir");
let executeBtn = document.getElementById("run");
let resetBtn = document.getElementById("reset");
let stepBtn = document.getElementById("step-by-step");
let simulationStatus = "STOP",
	lastInstruction = "null",
	lastFail = "There is not any yet",
	lastDirection = "";

exitBtn.addEventListener("click", function () {
	switchStartSimulationWindow("block", "none");
	executeBtn.disabled = false;
	stepBtn.disabled = false;
});

function loadPageInformation(page) {
	lbl_status.innerHTML = simulationStatus;
	lbl_instruction.innerHTML = lastInstruction;
	lbl_pageFail.innerHTML = lastFail;
	lbl_direction.innerHTML = lastDirection;
	lbl_time.innerHTML = totalMilisecondsOfToday() - startTimeIn_ms;
	lbl_virtualPage.innerHTML = temporaryPages[page].virualPage;
	lbl_physicalPage.innerHTML = temporaryPages[page].physicalPage;
	if (temporaryPages[page].lastTouch > 10000) temporaryPages[page].Rbit = 0;
	lbl_Rbit.innerHTML = temporaryPages[page].Rbit ? 1 : 0;
	lbl_Mbit.innerHTML = temporaryPages[page].Mbit ? 1 : 0;
	lbl_memoryTime.innerHTML = temporaryPages[page].inMemTime;
	lbl_lastUpdate.innerHTML = temporaryPages[page].lastTouch;
	lbl_low.innerHTML = temporaryPages[page].low;
	lbl_high.innerHTML = temporaryPages[page].high;
	LRUpage.innerHTML =
		temporaryLRUList.length == 0
			? `(-1,-1)`
			: `(${temporaryLRUList[temporaryLRUList.length - 1].physicalPage},${
					temporaryLRUList[temporaryLRUList.length - 1].virualPage
			  })`;
	MRUpage.innerHTML =
		temporaryLRUList.length == 0
			? `(-1,-1)`
			: `(${temporaryLRUList[0].physicalPage},${temporaryLRUList[0].virualPage})`;
}

function writeOutputFiles() {
	fs.writeFileSync("tracefile.txt", outputStatusLines);
}

resetBtn.addEventListener("click", function () {
	validateData();
	writeOutputFiles();
	outputStatusLines = "";
	temporaryLRUList = LRUList.slice();
	temporaryPages = pages.slice();
	temporaryCommands = commands.slice();
	loadVirtualMemoryTable();
	lbl_status.innerHTML = "STOP";
	lbl_instruction.innerHTML = "Null";
	lbl_pageFail.innerHTML = "There is not any yet";
	lbl_time.innerHTML = "";
	lbl_virtualPage.innerHTML = "";
	lbl_physicalPage.innerHTML = "";
	lbl_Rbit.innerHTML = "";
	lbl_Mbit.innerHTML = "";
	lbl_memoryTime.innerHTML = "";
	lbl_lastUpdate.innerHTML = "";
	lbl_low.innerHTML = "";
	lbl_high.innerHTML = "";
	executeBtn.disabled = false;
	stepBtn.disabled = false;
});

function executeOneInstruction() {
	let currCommand = temporaryCommands.shift();
	let asignedFrame;
	let currTime = totalMilisecondsOfToday();
	let pageNumber = Math.trunc(currCommand.address / memoryAttr.pageSize);
	lastFail = "";
	lastInstruction = currCommand.statement;
	lastDirection = currCommand.address;
	outputStatusLines += `${lastInstruction} ${lastDirection.toString(
		currCommand.base
	)} ...`;
	if (temporaryPages[pageNumber].physicalPage == -1) {
		temporaryPages[pageNumber].tiempoEntradaAMemoria = currTime;
		lastFail += "There was failure";
		outputStatusLines += " page fault\n";
		if (temporaryLRUList.length == memoryAttr.pageFrame) {
			let pageThatComesOUt = temporaryLRUList.pop();
			asignedFrame = pages[pageThatComesOUt.virualPage].physicalPage;
			pages[pageThatComesOUt.virualPage].physicalPage = -1;
			lastFail += `, page ${pageThatComesOUt.virualPage} comes out`;
		} else {
			for (
				asignedFrame = 0;
				asignedFrame < memoryAttr.pageFrame;
				asignedFrame++
			) {
				let asigned = false;
				for (let pag of temporaryPages) {
					if (asignedFrame == pag.physicalPage) asigned = true;
				}
				if (asigned == false) break;
			}
		}
	} else {
		outputStatusLines += " ok\n";
		lastFail += "Nothing happened";
		let LRUpage;
		for (LRUpage = 0; LRUpage < temporaryLRUList.length; LRUpage++)
			if (temporaryLRUList[LRUpage].virualPage == pageNumber) break;
		temporaryLRUList.splice(LRUpage, 1);
		asignedFrame = temporaryPages[pageNumber].physicalPage;
	}
	temporaryLRUList.unshift(temporaryPages[pageNumber]);
	temporaryPages[pageNumber].physicalPage = asignedFrame;
	temporaryPages[pageNumber].Rbit = true;
	temporaryPages[pageNumber].tiempoUltimaReferencia = currTime;
	temporaryPages[pageNumber].Mbit = /^WRITE$/i.test(currCommand.statement)
		? true
		: false;
	loadPageInformation(pageNumber);
}

stepBtn.addEventListener("click", function () {
	simulationStatus = "STEP";
	executeOneInstruction();
	loadVirtualMemoryTable();
	if (temporaryCommands.length == 0) {
		stepBtn.disabled = true;
		executeBtn.disabled = true;
		writeOutputFiles();
	}
});

executeBtn.addEventListener("click", function () {
	simulationStatus = "RUN";
	while (temporaryCommands.length != 0) executeOneInstruction();
	loadVirtualMemoryTable();
	writeOutputFiles();
	executeBtn.disabled = true;
	stepBtn.disabled = true;
});