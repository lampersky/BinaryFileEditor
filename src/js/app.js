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
			link: function(scope, element, attrs, ngModel) {
				var processDragOverOrEnter;
				processDragOverOrEnter = function(event) {
					if (event != null) {
						event.stopPropagation();
						event.preventDefault();
					}
					event.dataTransfer.effectAllowed = 'copy';
					return false;
				};
				element.bind('dragover', processDragOverOrEnter);
				element.bind('dragenter', processDragOverOrEnter);
				return element.bind('drop', function(event) {
					if (event != null) {
						event.preventDefault();
					}
					if (event.dataTransfer.files.length == 1) {
						ngModel.$setViewValue(event.dataTransfer.files[0]);
						scope.$apply();
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
	
	app.filter('test', function() {
		return function(x) {
			return x;
		};
	});

	MainController.$inject = ["$scope"];

	function MainController($scope) {
		let vm = this;

		vm.items = [];
		vm.binaryFile = undefined;
		vm.descriptionFile = undefined;
		vm.process = process;
		vm.create = create;
		vm.outputBinaryFile = undefined;
		vm.processFile = processFile;

		function init() {
			// $scope.$watch('mc.binaryFile', function(newValue, oldValue) {
				// if (newValue) {
					// readBinaryFile(vm.binaryFile, null, function (offsets) {
						// console.log("done");
					// });
				// }
			// });
			$scope.$watch('mc.descriptionFile', function(newValue, oldValue) {
				if (newValue) {
					readJsonFile(vm.descriptionFile, function(items) {
						vm.items = items;
						fillGaps(vm.binaryFile.size);
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
		
		function fillGaps(fileSize) {
			var missing = [];
			vm.items = _.sortBy(vm.items, 'offset');
			if (vm.items.length > 0) {
				//before
				if (vm.items[0].offset != 0) {
					missing.push({'offset' : 0, 'length' : vm.items[0].offset});
				}
				//middle
				if (vm.items.length >= 2) {
					for (var i=0; i<vm.items.length-1; i++) {
						var currentItem = vm.items[i];
						var nextItem = vm.items[i+1];
						var newOffset = currentItem.offset+currentItem.length;
						if (newOffset != nextItem.offset) {
							missing.push({'offset' : newOffset, 'length' : nextItem.offset-newOffset});
						}
					}
				}
				//last
				if (fileSize) {
					var lastItem = vm.items[vm.items.length-1];
					var offset = lastItem.offset + lastItem.length;
					if (offset < fileSize) {
						missing.push({'offset' : offset, 'length' : fileSize-offset});
					}
				}
			}
			vm.items = vm.items.concat(missing);
			vm.items = _.sortBy(vm.items, 'offset');
		}
		
		function create() {
			var data = [];
			for (var i=0; i<vm.items.length; i++) {
				if (vm.items[i].mime == 'text/plain') {
					vm.items[i].newArray = new TextEncoder().encode(vm.items[i].newText);
					vm.items[i].newLength = vm.items[i].newArray.length;
				}
				if (vm.items[i].newArray) {
					data.push(vm.items[i].newArray);
					if (vm.items[i].newLength < vm.items[i].length) {
						//todo: fill with zeros
						var size = vm.items[i].length - vm.items[i].newLength;
						let zeros = new ArrayBuffer(size);
						data.push(new Uint8Array(zeros));
					}
				} else {
					data.push(vm.items[i].array);
				}
			}
			var blob = new Blob(data, {type : 'application/octet-stream'});
			var dataURL = window.URL.createObjectURL(blob);
			vm.outputBinaryFile = dataURL;
			window.location.href = dataURL;
		}
		
		function process() {
			if (vm.binaryFile && vm.descriptionFile) {
				readBinaryFile(vm.binaryFile, null, function (offsets) {
					console.log("done");
				});
			} else {
				alert("Choose binary and description files first!");
			}
		}

		function readJsonFile(file, onSuccessCallback, onErrorCallback) {
			var readEventHandler = function(evt) {
				if (evt.target.error == null) {
					var arrayBuffer = this.result,
					array = new Uint8Array(arrayBuffer);
					try {
						var binaryString = String.fromCharCode.apply(null, array);
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
		
		function readBinaryFile(file, onItemCallback, onSuccessCallback) {
			var chunkReaderBlock = null;
			var item = 0;

			var readEventHandler = function(evt) {
				if (evt.target.error == null) {
					var arrayBuffer = this.result,
						array = new Uint8Array(arrayBuffer);
					vm.items[item].array = array;
					var data = new Blob([array], {
						type: vm.items[item].mime
					});
					if (vm.items[item].mime == 'text/plain') {
						//var binaryString = String.fromCharCode.apply(null, array);
						var text = decodeUtf8(array);
						vm.items[item].text = text;
						vm.items[item].newText = text;
					}
					var dataURL = window.URL.createObjectURL(data);
					vm.items[item].dataUrl = dataURL;
				} else {
					return;
				}
				if (++item >= vm.items.length) {
					$scope.$apply();
					onSuccessCallback(vm.items);
					return;
				}
				chunkReaderBlock(vm.items[item].offset, vm.items[item].length, file);
			}

			chunkReaderBlock = function(_offset, length, _file) {
				var r = new FileReader();
				var blob = _file.slice(_offset, length + _offset);
				r.onload = readEventHandler;
				r.readAsArrayBuffer(blob);
			}

			chunkReaderBlock(vm.items[item].offset, vm.items[item].length, file);
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
		
		init();
	}

})();