'use strict';
/**
 * `file-tree-slection` type prompt
 */

const fs = require('fs');
const path = require('path');

const chalk = require('chalk');
const {filter, takeWhile} = require('rxjs/operators');
const figures = require('figures');
const cliCursor = require('cli-cursor');
const Base = require('inquirer/lib/prompts/base');
const observe = require('inquirer/lib/utils/events');
const Paginator = require('./paginatorNonInfinite');



class FileTreeSelectionPrompt extends Base {
	
	
	getDirectoryContents(path=this.currentDirectory){
		const dirContents = fs.readdirSync(path);
		const mapped = dirContents.map(item => {
			const fullPath = path + '/' + item;
			return fs.lstatSync(fullPath).isDirectory() ? 
				{fullPath: fullPath, isDirectory: true, displayString: figures.pointer + ' ' + item} : 
				{fullPath: fullPath, isDirectory: false, displayString: item};
		});
		const sorted =[...mapped.filter(item => item.isDirectory), ...mapped.filter(item => !item.isDirectory)];
		return sorted;
	}
	
	constructor(questions, rl, answers) {
		super(questions, rl, answers);

		this.currentDirectory = path.resolve(process.cwd(), this.opt.path || '.');
		this.directoryContents = this.getDirectoryContents();
		this.shownList = [];
		this.firstRender = true;
		this.invalidSelection = false;

		this.opt = {
			...{
			  path: null,
			  pageSize: 10 ,
			  onlyShowMatchingExtensions: false,
			  selectionType: 'file',
			  extensions: [],
			},
			...this.opt
		  }

		// Make sure no default is set (so it won't be printed)
		this.opt.default = null;
		this.opt.pageSize = 10;

		this.paginator = new Paginator(this.screen);
	}

	/**
   * Start the Inquiry session
   * @param  {Function} cb  Callback when prompt is done
   * @return {this}
   */

	_run(cb) {
		this.done = cb;

		const events = observe(this.rl)

		events.normalizedUpKey
			.pipe(takeWhile(() => this.status !== 'answered'))
			.forEach(this.onUpKey.bind(this));
		events.normalizedDownKey
		.pipe(takeWhile(() => this.status !== 'answered'))
		.forEach(this.onDownKey.bind(this));
		events.spaceKey
		.pipe(takeWhile(() => this.status !== 'answered'))
		.forEach(this.onSpaceKey.bind(this));
		events.keypress
		.pipe(takeWhile(() => this.status !== 'answered'))
		.pipe(filter(key => key.key.name === 'escape'))
		.forEach(this.onEscKey.bind(this));
		



		events.line
			.forEach(this.onSubmit.bind(this));


		cliCursor.hide();
		if (this.firstRender) {
			this.renderNewDirectory(this.currentDirectory);
		}

		return this;

	}

	renderNewDirectory(path){
		this.currentDirectory = path
		this.directoryContents = this.getDirectoryContents()
		this.shownList = this.getShownList()
		this.selected = this.directoryContents.find(directoryItem => directoryItem.displayString === this.shownList[0])
		this.invalidSelection = false;
		this.renderCurrentDirectory()
	}

	

	getShownList(){
		let shownList = undefined
		if(this.opt.onlyShowMatchingExtensions){
			shownList = this.directoryContents.filter(directoryItem => {
				return this.opt.extensions.some(extension => {
					return directoryItem.displayString.endsWith(extension)
				}) || directoryItem.isDirectory
			})
		}
		else{
			shownList = this.directoryContents
		}

		return shownList.map(item => item.displayString)
	}

	/**
   * Render the prompt to screen
   * @return {FileTreeSelectionPrompt} self
   */

	renderCurrentDirectory() {
		// Render question
		let message = this.getQuestion();
		

		if (this.firstRender) {
			this.firstRender = false;
		}

		

		if (this.status === 'answered') {
			message += chalk.cyan(this.selected.fullPath);
		}
		else {
			message += ' ' + chalk.gray(this.currentDirectory)
			if(this.invalidSelection){
				message+='\n' + chalk.red("Invalid selection. Please choose another option.") +'\n';
			}
			const directoryString = this.convertDirectoryContentToString();
			message += '\n' + this.paginator.paginate(directoryString + '\n \n\n', this.shownList.indexOf(this.selected.displayString), this.opt.pageSize);
		}

		this.screen.render(message);
	}

	convertDirectoryContentToString(directoryContents = this.directoryContents, indent = 2) {
		let output = '';

		directoryContents.forEach(directoryItem => {
			if (directoryItem.displayString === this.selected.displayString) {
				if(this.checkValidExtension(this.selected.displayString) || this.selected.isDirectory){
					output += '\n' + chalk.hex('#0598BC')(directoryItem.displayString);
				}
				else{
					output += '\n' + chalk.hex('#8dabb3')(directoryItem.displayString);
			}
		}
			else {
				if(this.checkValidExtension(directoryItem.displayString) || directoryItem.isDirectory){
				output += '\n' +  directoryItem.displayString;
			}
			else{
				output += '\n' +  chalk.hex('#8f8f8f')(directoryItem.displayString);
			}
		}
	});

		return output;
	}

	/**
   * When user press `enter` key
   */

	onSubmit() {
		const valid = this.checkValidSelection()
		if (!valid) {
			this.invalidSelection = true;
			this.renderCurrentDirectory()
			return;
		}
		else{
	  
			this.status = 'answered';

			this.renderCurrentDirectory();

			this.screen.done();
			cliCursor.show();
			this.done(this.selected.fullPath);
		}
	}
		
	

	checkValidSelection(){
		if(this.selected.isDirectory){
			return this.opt.selectionType === 'folder'
		}
		else {
			return this.opt.selectionType === 'file' && this.checkValidExtension(this.selected.displayString)
			
		}
	}

	checkValidExtension(item){
		return this.opt.extensions.length ===0 || this.opt.extensions.some(extension => {
			return item.endsWith(extension)
	})
}

	moveSelected(distance = 0) {
		const currentIndex = this.shownList.indexOf(this.selected.displayString);
		let index = currentIndex + distance;
		if (index >= this.shownList.length) {
			index = this.shownList.length - 1;
		}
		else if (index < 0) {
			index = 0;
		}

		this.selected = this.directoryContents.find(item => item.displayString === this.shownList[index]);

		this.renderCurrentDirectory();
	}

	/**
   * When user press a key
   */
	onUpKey() {
		this.moveSelected(-1);
	}

	onDownKey() {
		this.moveSelected(1);
	}

	onSpaceKey() {
		if (!this.selected.isDirectory) {
			return;
		}
		this.renderNewDirectory(this.selected.fullPath);
	}
	onSpaceKey() {
		if (!this.selected.isDirectory) {
			return;
		}
		this.renderNewDirectory(this.selected.fullPath);
	}

	onEscKey(){
		const splCurrentDirectory = this.currentDirectory.split('/')
		splCurrentDirectory.pop()
		this.renderNewDirectory(splCurrentDirectory.join('/'))
	}

}

module.exports = FileTreeSelectionPrompt;
