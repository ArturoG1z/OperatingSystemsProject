<p align="center">
    <img width="128" src="https://upload.wikimedia.org/wikipedia/commons/9/91/Electron_Software_Framework_Logo.svg">
</p>

# Operating Systems Project 👇
## Memory Administration

The project is designed to simulate memory management by illustrating the behavior of page faults in a virtual paged memory system through an LRU replacement algorithm. The program reads the initial state of the page table and a sequence of imtructions in virtual memory and writes the effect of each imtruction to an output file. 

Based on the specifications of the file [Proyecto2](documents/Proyecto2.pdf), provided by my teacher Raymundo Marcial.

# This project is made using

[Electron](https://electronjs.org/)

## Prerequisites

The following software must be installed:
* node 8.9.3+
* npm 5.0+ (or yarn)

## Installation

``` bash
# install dependencies
$ npm install # Or yarn
```

## Prerequisites for execution

You need to have two configuration files, in order to carry out the simulation, they must be located in the main directory of the project, or where the executable file is located.

### Command File [commands.conf](commands.conf)

The file that has commands for the simulator specifies a sequence of memory instructions to be performed. Each instruction is a read operation or a write operation and includes the virtual memory address in decimal format to be read or written. If the virtual page of the address included is present in physical memory, the operation will be successful otherwise, a page fault will be generated.
The format of each command is:

``` c
operation address
//or
operation random 
```

### Configuration File [memory.conf](memory.conf)

The named configuration file is used to specify the initial contents of the virtual memory map (which virtual memory pages are mapped to which physical memory pages) and provides other configuration information.

The memset command is used to initialize each entry in the virtual memory map. The memset command is followed by six integer values:

1. The number of virtual page to initiate.
2. The physical page number associated with this virtual page (-1 if no page was assigned)
3. If the page has been read (R value) (0 = no, 1 = yes)
4. If the page has been modified (M value) (0 = no, 1 = yes)
5. The amount of time the page has been in memory (in ms)
6. The last time (more) the page was modified (in more)

Other configuration file options:
There are other options which are specified in the con guration file. These are summarized in the following table.

| Word | Value | Description  |
|---|---|---|
| pagenum | integer  | The number of virtual pages of the simulator |
| pageframe | integer | The number of physical pages of the simulator. |
| pagesize | integer | The page size in bytes |

#### See the following examples so you can understand the behavior of the files: [memory.conf](memory.conf) & [commands.conf](commands.conf)

## Usage

``` bash
$ npm start
# If you need to generate an executable you must install electron-builder
```

## Output File tracefile.txt

The output file contains information about the simulation since it started (or since the last reset). List the command that was attempted and what happened as a result. User will be able to review this file after simulation.
The output file contains one line for each operation executed. The format of each line is as follows
```
command address status
```
Where
1. **command** is *'READ'* or *'WRITE'*
2. **address** is a number that corresponds to the virtual memory address
3. **status** is *'ok'* or *'page fault'*