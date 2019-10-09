(function() {
	"use strict";
	let app = angular.module("myApp", []).controller("MainController", MainController);
  
	app.config(['$compileProvider', function ($compileProvider) {
		$compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|local|blob|data|chrome-extension):/);
	}]);
  
	app.directive('fileDrop', function() {
		return {
			restrict: 'A',
			require: "ngModel",
			scope: {
				processFile: '&',
				maxFileSize: '=',
				classOver: '@'
			},
			link: function(scope, element, attrs, ngModel) {
				element.bind('dragleave', function(event) {
					if (event != null) {
						event.stopPropagation();
						event.preventDefault();
						if (scope.classOver) {
						   $(event.currentTarget).removeClass(scope.classOver);
						}
					}
					return false;
				});
				element.bind('dragover', function (event) {
					if (event != null) {
						event.stopPropagation();
						event.preventDefault();
						event.dataTransfer.effectAllowed = 'copy';
						if (scope.classOver) {
						   $(event.currentTarget).addClass(scope.classOver);
						}
					}
					return false;
				});
				element.bind('dragenter', function(event) {
					if (event != null) {
						event.stopPropagation();
						event.preventDefault();
						event.dataTransfer.effectAllowed = 'copy';
					}
					return false;
				});
				return element.bind('drop', function(event) {
					if (event != null) {
						event.preventDefault();
						if (scope.classOver) {
						   $(event.currentTarget).removeClass(scope.classOver);
						}
					}
					if (event.dataTransfer.files.length == 1) {
						if (!scope.maxFileSize || (scope.maxFileSize && event.dataTransfer.files[0].size <= scope.maxFileSize)) {
							ngModel.$setViewValue(event.dataTransfer.files[0]);
							scope.$apply();
							scope.processFile();
						} else {
							alert('File too big! Max file size: ' + scope.maxFileSize + ' bytes');
						}
					}
					return false;
				});
			}
		};
	});
	
	app.directive('fileUpload', function() {
		return {
			restrict: 'A',
			require: 'ngModel',
			scope: {
				processFile: '&',
				maxFileSize: '='
			},
			link: function(scope, element, attrs, ngModel) {
				element.on('change', function(e) {
					var files = element[0].files;
					console.log(files[0]);
					if (!scope.maxFileSize || (scope.maxFileSize && files[0].size <= scope.maxFileSize)) {
						ngModel.$setViewValue(files[0]);
						scope.$apply();
						scope.processFile();
					} else {
						alert('File too big! Max file size: ' + scope.maxFileSize + ' bytes');
					}
				})
			}
		};
	});
	
	app.directive('myAudio', function() {
		return {
			restrict: 'E',
			link: function(scope, element, attr) {
				var player = $(element).find('.player')[0];
				var play = $(element).find('.play');
				var pause = $(element).find('.pause');
				var stop = $(element).find('.stop');
				play.on('click', function() {
					player.play();
				});
				pause.on('click', function() {
					player.pause();
				});
				$(stop).on('click', function() {
					player.pause();
					player.currentTime = 0.0;
				});
			}
		};
	});
	
	app.directive('maxLengthInBytes', function () {
		return {
			require: 'ngModel',
			scope: {
				maxLengthInBytes: '='
			},
			link: function (scope, element, attr, ngModelCtrl) {
				function isMalformed(text) {
					try {
						decodeURI(text);
						return false;
					} catch {
						return true;
					}
				}
				function cut(text, length) {
					var arr = encodeURI(text).split(/(%..|.)/).filter(function(e){return e});
					if (arr.length > length) {
						arr = arr.splice(0, length);
						while (isMalformed(arr.join(''))) {
							arr = arr.splice(0, --length);
						}
					}
					return decodeURI(arr.join(''));
				}
				function fromUser(text) {
					if (text) {
						var newText = cut(text, scope.maxLengthInBytes)
						if (newText !== text) {
							ngModelCtrl.$setViewValue(newText);
							ngModelCtrl.$render();
						}
						return newText;
					}
					return undefined;
				}            
				ngModelCtrl.$parsers.push(fromUser);
			}
		};
	});
	
	app.filter('unsafe', function($sce) {
		return function(value) {
			return $sce.trustAsHtml(value);
		};
	});
	
	app.filter('hms', function() {
		return function(x) {
			var h = Math.floor(x / 3600000);
			var m = Math.floor((x - h*3600000) / 60000);
			var s = Math.floor((x - h*3600000 - m*60000) / 1000);
			var ms = Math.floor(x % 1000);
			return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms}`;
		};
	});
	
	app.filter('ffs', function() {
		return function (x) {
			const i = Math.floor(Math.log(x) / Math.log(1024));
			return parseFloat((x / Math.pow(1024, i)).toFixed(3)) + ' ' + (i>0?" KMGTP".charAt(i):'') + 'B';
		};
	});

	MainController.$inject = ["$scope"];

	function MainController($scope) {
		let vm = this;

		vm.items = [];
		vm.itemsPart = [];
		vm.binaryFile = undefined;
		vm.descriptionFile = undefined;
		vm.process = process;
		vm.create = create;
		vm.outputBinaryFile = undefined;
		vm.processFile = processFile;
		vm.isSupportedImage = isSupportedImage;
		vm.isSupportedAudio = isSupportedAudio;
		vm.sort = sort;
		vm.createDescriptionFile = createDescriptionFile;
		vm.progress = 0;
		vm.sortBy = 'offset';
		vm.page = 1;
		vm.goToPage = function(page) {
			vm.page = page;
		};
		vm.pages = function() {
			return Math.ceil(vm.items.length / 60);
		};
		vm.searchMode = true;
		vm.clearItems = function() { vm.items = []; $scope.$apply(); };

		function sort(sortBy) {
			var idx = vm.sortBy.indexOf(sortBy);
			if (idx != -1) {
				sortBy = (idx == 0 ? '-' + sortBy : sortBy.slice(0));
			}
			vm.sortBy = sortBy;
		}

		function init() {
			$scope.$watch('mc.descriptionFile', function(newValue, oldValue) {
				if (newValue) {
					readJsonFile(vm.descriptionFile, function(items) {
						if (vm.binaryFile) {
							vm.items = items;
							processBinaryFile();
						}
					}, function(error) {
						console.log("something went wrong", error);						
					});
				}
			});
		}
		
		function processFile(item) {
			readFile(item.newFile, function(array, dataURL) {
				item.newArray = array;
				item.newDataUrl = dataURL;
				if (item.mime == 'text/plain') {
					item.newText = decodeUtf8(array);
				}
				item.newLength = array.length;
				$scope.$apply();
			});
		}
		
		function fillGaps(items, onProgress, onGapsFilled) {
			items = _.sortBy(items, 'offset');
			var missing = [];
			var fileSize = vm.binaryFile.size;
			//array needs to have at least one item!
			if (items.length > 0) {
				//before
				var firstItem = items[0];
				if (firstItem.offset != 0) {
					missing.push({'offset' : 0, 'length' : firstItem.offset});
				}
				//middle
				if (items.length >= 2) {
					for (var i=0; i<items.length-1; i++) {
						var currentItem = items[i];
						var nextItem = items[i+1];
						var newOffset = currentItem.offset+currentItem.length;
						if (nextItem.offset > newOffset) {
							missing.push({'offset' : newOffset, 'length' : nextItem.offset-newOffset});
						} else if (nextItem.offset < newOffset) {
							console.log("Item @", currentItem.offset, "is broken");
						}
					}
				}
				//last
				var lastItem = items[items.length-1];
				var offset = lastItem.offset + lastItem.length;
				if (offset < fileSize) {
					missing.push({'offset' : offset, 'length' : fileSize-offset});
				}
			}
			
			readBinaryFile(vm.binaryFile, missing, onProgress, onGapsFilled);
		}
		
		function isSupportedImage(mime) {
			//should icon has mime 'image/vnd.microsoft.icon'?
			return ['image/gif', 'image/jpeg', 'image/png', 'image/bmp', 'image/x-icon'].indexOf(mime) != -1;
		}
		
		function isSupportedAudio(mime) {
			return ['audio/mpeg', 'audio/wav'].indexOf(mime) != -1;
		}
		
		function create() {
			var busy = $('#busy');
			busy.modal('show').on('shown.bs.modal', function (e) {
				busy.modal('show').off('shown.bs.modal');
			
				//we need to fill gaps between found items
				fillGaps(vm.items, function(progress) {
					vm.progress = progress;
					$scope.$apply();
				}, function(gaps) {
					gaps = gaps.concat(vm.items);
					var allTogether = _.sortBy(gaps, 'offset');
					
					createNewImage(allTogether);
					
					//reset progres and hide modal
					vm.progress = 0;
					busy.modal('hide');
				});
			});
		}
		
		function createNewImage(items) {
			var data = [];
			for (var i=0; i<items.length; i++) {
				if (items[i].mime == 'text/plain') {
					items[i].newArray = new TextEncoder().encode(items[i].newText);
					items[i].newLength = items[i].newArray.length;
				}
				if (items[i].newArray) {
					data.push(items[i].newArray);
					if (items[i].newLength < items[i].length) {
						//todo: fill with zeros
						var size = items[i].length - items[i].newLength;
						let zeros = new ArrayBuffer(size);
						data.push(new Uint8Array(zeros));
					}
				} else {
					data.push(items[i].array);
				}
			}
			var blob = new Blob(data, {type : 'application/octet-stream'});
			var dataURL = window.URL.createObjectURL(blob);
			vm.outputBinaryFile = dataURL;
			window.location.href = dataURL;
		}
		
		function process(type) {
			var functions = { 'png' : searchPNGs, 'jpg' : searchJPGs, 'gif' : searchGIFs, 'bmp' : searchBMPs, 'wav' : searchWAVs, 'mp3' : searchMP3s, 'tiff' : searchTIFFs, 'ico' : searchICOs };
			if (functions[type] == undefined) {
				alert('Unsupported type!');
				return;
			}
			if (vm.binaryFile) {
				var c = 0;
				var busy = $('#busy');
				busy.modal('show').on('shown.bs.modal', function (e) {
					busy.modal('show').off('shown.bs.modal');
					var start = performance.now();
					if (functions[type]) {
						functions[type](vm.binaryFile, function(offset, length, mime, extension, width, height, bytes, duration) {
							c++;
							if (true) {
								var data = new Blob([bytes], {
									type: mime
								});
								var dataURL = window.URL.createObjectURL(data);
								var obj = { 'offset' : offset, 'length' : length, 'mime' : mime, 'extension' : extension, 'array' : bytes, 'dataUrl' : dataURL};
								if (isSupportedImage(mime)) {
									obj = Object.assign({}, obj, {'width' : width, 'height' : height});
								}
								if (isSupportedAudio(mime)) {
									obj = Object.assign({}, obj, {'duration' : duration});
								}
								let found = vm.items.find(item => item.offset == obj.offset);
								if (!found) {
									vm.items.push(obj);
									$scope.$apply();
								}
							}
							//console.log(offset, length, width, height);
						}, function () {
							console.log('count', c, 'time', performance.now() - start);
							vm.progress = 0;
							busy.modal('hide');
						}, function(progress) {
							vm.progress = progress;
							$scope.$apply();
						});
					}
				});
				

			}
		}
		
		function processBinaryFile() {
			if (vm.items.length > 0) {
				var busy = $('#busy');
				busy.modal('show').on('shown.bs.modal', function (e) {
					busy.modal('show').off('shown.bs.modal');
				
					readBinaryFile(vm.binaryFile, vm.items, function(progress) {
						vm.progress = progress;
						$scope.$apply();
					}, function (offsets) {
						vm.progress = 0;
						busy.modal('hide');
					});
				});
			} else {
				alert("Choose binary and description files first!");
			}
		}
		
		function createDescriptionFile() {
			if (vm.items.length > 0) {
				var output = [];
				for (var i=0; i<vm.items.length; i++) {
					var item = vm.items[i];
					output.push({ 'offset' : item.offset, 'length' : item.length, 'mime' : item.mime, 'extension' : item.extension});
				}
				var blob = new Blob([JSON.stringify(output)], {type : 'application/json;charset=utf-8'});
				var dataURL = window.URL.createObjectURL(blob);
				vm.outputBinaryFile = dataURL;
				
				var temporaryLink = document.createElement('a');
				temporaryLink.download = 'desc.json';
				temporaryLink.href = dataURL;
				temporaryLink.click();
				//this solution doesn't allow to specify name
				//window.location.href = dataURL;
			} else {
				alert("Choose binary and try to find some 'items' inside first!");
			}
		}
	
		function readJsonFile(file, onSuccessCallback, onErrorCallback) {
			var readEventHandler = function(evt) {
				if (evt.target.error == null) {
					var arrayBuffer = this.result,
					array = new Uint8Array(arrayBuffer);
					try {
						var binaryString = new TextDecoder('utf-8').decode(array);
						var json = JSON.parse(binaryString);
						onSuccessCallback(json);
					} catch (error) {
						onErrorCallback(error);
					}					
				} else {
					return;
				}
			}
			var r = new FileReader();
			r.onload = readEventHandler;
			r.readAsArrayBuffer(file);
		}
		
		function readFile(file, onSuccessCallback) {
			var reader = new FileReader();
			reader.onloadend = function(evt) {
			  if (evt.target.readyState == FileReader.DONE) {
					var arrayBuffer = evt.target.result,
						array = new Uint8Array(arrayBuffer);
					var data = new Blob([array], {
						type: ''//vm.items[item].mime
					});
					var dataURL = window.URL.createObjectURL(data);
					onSuccessCallback(array, dataURL);
			  }
			};
			reader.readAsArrayBuffer(file);
		}
		
		function readBinaryFile(file, items, onProgress, onSuccessCallback) {
			var chunkReaderBlock = null;
			var item = 0;
			
			if (items.length == 0) {
				onSuccessCallback(items);
				return;
			}

			var readEventHandler = function(evt) {
				if (evt.target.error == null) {
					var arrayBuffer = this.result,
						array = new Uint8Array(arrayBuffer);
					items[item].array = array;
					if (items[item].mime) {
						var data = new Blob([array], {
							type: items[item].mime
						});
						if (items[item].mime == 'text/plain') {
							var text = decodeUtf8(array);
							items[item].text = text;
							items[item].newText = text;
						}
						var dataURL = window.URL.createObjectURL(data);
						items[item].dataUrl = dataURL;
					}
					if (typeof(onProgress) === "function") {
						onProgress(~~(100*items[item].offset/file.size));
					}
				} else {
					return;
				}
				if (++item >= items.length) {
					$scope.$apply();
					onSuccessCallback(items);
					return;
				}
				chunkReaderBlock(items[item].offset, items[item].length, file);
			}

			chunkReaderBlock = function(_offset, length, _file) {
				var r = new FileReader();
				var blob = _file.slice(_offset, length + _offset);
				r.onload = readEventHandler;
				r.readAsArrayBuffer(blob);
			}

			chunkReaderBlock(items[item].offset, items[item].length, file);
		}
			
		function decodeUtf8(arrayBuffer) {
			var result = "";
			var i = 0;
			var data = new Uint8Array(arrayBuffer);
			if (data.length >= 3 && data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf) {
				i = 3;
			}
			while (i < data.length) {
				var c = data[i];
				if (c < 128) {
					result += String.fromCharCode(c);
					i++;
				} else if (c > 191 && c < 224) {
					if (i + 1 >= data.length) {
						throw "UTF-8 Decode failed.";
					}
					c2 = data[i + 1];
					result += String.fromCharCode(((c & 31) << 6) | (c2 & 63));
					i += 2;
				} else {
					if (i + 2 >= data.length) {
						throw "UTF-8 Decode failed.";
					}
					result += String.fromCharCode(((c & 15) << 12) | ((data[i + 1] & 63) << 6) | (data[i + 2] & 63));
					i += 3;
				}
			}
			return result;
		}
		
		const typedArray = hex => new Uint8Array(hex.match(/[\da-f]{2}/gi).map(function (h) {
			return parseInt(h, 16)
		}));
		
		init();
	}

})();