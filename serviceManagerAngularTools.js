angular.module('ServiceManagerAngularTools', [])
.service('dictionary', function($q, $http, $rootScope)
{
	var _service = this;
	var _dictionary = {};
	var _loader = $q.defer();
	var _lang = null;

	_service.lang = null;

	_service.setLang = function(lang)
	{
		_lang = lang;
		$rootScope.$broadcast('dictionary-setLanguage', lang);
	}

	_service.get = function(term, index, defaultValue)
	{
		if (defaultValue === undefined && typeof index === 'string')
		{
			return (_dictionary[_lang] && _dictionary[_lang][term]) || defaultValue;
		}
		if (index === undefined)
		{
			return (_dictionary[_lang] && _dictionary[_lang][term]) || defaultValue || term;
		}
		if (_dictionary[_lang] && _dictionary[_lang][term])
		{
			return _dictionary[_lang][term][index] || (term + index);
		}
		return term + index;
	};

	_service.getLanguages = function()
	{
		var list = {};

		for (var lang in _dictionary)
		{
			list[lang] = _dictionary[lang]['_lang'];
		}

		if (Object.keys(list).length > 1)
		{
			return list;
		}
		return {};
	};

	_service.formatDate = function(date, format)
	{
		var dateStr = _service.get(format || '_date', '%yyyy-%mm-%dd');
		var month = date.getMonth() + 1;
		var day = date.getDate();
		var hours = date.getHours();
		var minutes = date.getMinutes();

		if (dateStr.indexOf('%a') === -1)
		{
			dateStr = dateStr.replace('%yyyy', date.getFullYear());
			dateStr = dateStr.replace('%yy', date.getYear());
			dateStr = dateStr.replace('%dd', leftPad(day, 2, '0'));
			dateStr = dateStr.replace('%d', day);
			dateStr = dateStr.replace('%mm', leftPad(month, 2, '0'));
			dateStr = dateStr.replace('%m', month);
			dateStr = dateStr.replace('%hh', leftPad(hours, 2, '0'));
			dateStr = dateStr.replace('%h', hours);
			dateStr = dateStr.replace('%nn', leftPad(minutes, 2, '0'));
			dateStr = dateStr.replace('%n', minutes);
		}
		else
		{
			dateStr = dateStr.replace('%yyyy', date.getFullYear());
			dateStr = dateStr.replace('%yy', date.getYear());
			dateStr = dateStr.replace('%mm', leftPad(month, 2, '0'));
			dateStr = dateStr.replace('%m', month);
			dateStr = dateStr.replace('%dd', leftPad(day, 2, '0'));
			dateStr = dateStr.replace('%d', day);
			dateStr = dateStr.replace('%nn', leftPad(minutes, 2, '0'));
			dateStr = dateStr.replace('%n', minutes);
			if (hours >= 12)
			{
				dateStr = dateStr.replace('%a', 'PM');
				hours = hours - 12;
			}
			else
			{
				dateStr = dateStr.replace('%a', 'AM');
			}
			hours = (hours === 0 ? 12 : hours);
			dateStr = dateStr.replace('%hh', leftPad(hours, 2, '0'));
			dateStr = dateStr.replace('%h', hours);
		}

		return dateStr;
	};

	_service.loader = _loader.promise;
	
	$http.get('dictionary.json')
		.then(
			function(response)
			{
				_dictionary = response.data;

				for (var lang in window.navigator.languages)
				{
					if (_dictionary[lang])
					{
						_lang = lang;
						break;
					}
					if (lang.length === 5 && _dictionary[lang.substr(0, 2)])
					{
						_lang = lang.substr(0, 2);
						break;
					}
				}

				if (_lang === null)
				{
					_lang = Object.keys(_dictionary)[0];
				}

				_service.lang = _lang;

				_loader.resolve();
			},
			function(response)
			{
				throw 'Failed to load dictionary';
			}
		);

	function leftPad(number, length, padChar)
	{
		var output = number.toString();

		if (output.length < length)
		{
			return (padChar || '0').toString().substr(0, 1).repeat(length - output.length) + output;
		}

		return output.slice(-length);
	};
		

})
.factory('showDialog', function($compile, dictionary)
{
	var _dialog = [];
	var _dialogMask = [];
	var _dialogIndex = -1;
	var _hotkeyMap = {};
	var _hotkeyList = [];

	function onkeypress(event)
	{
		if (_hotkeyList.indexOf(event.key) !== -1)
		{
			_hotkeyMap[event.key][0].click();
		}
	}

	return function(message, buttons, template)
	{
		++_dialogIndex;

		var _service = this;

		document.body.style.overflow = 'hidden';

		if (!_dialog[_dialogIndex])
		{
			_dialog[_dialogIndex] = $('<div class="dialog level' + (_dialogIndex % 3) + ' ng-hide" data-ng-controller="DialogController"><span class="message"></span><p></p><div class="buttons"></div></div>');
			_dialogMask[_dialogIndex] = $('<div class="dialogMask level' + (_dialogIndex % 3) + ' ng-hide"></div>');
			$(document.body)
				.append(_dialog[_dialogIndex])
				.append(_dialogMask[_dialogIndex]);
		}

		var messageText;
		
		if (angular.isArray(messageText))
		{
			messageText = dictionary.get(message[0]);

			for (var i = 1; i < message.length; i++)
			{
				messageText = messageText.replace(message[i].key, dictionary.get(message[i].message, message[i].index));
			}
		}
		else
		{
			messageText = dictionary.get(message);
		}

		var dialog = _dialog[_dialogIndex];
		var dialogMask = _dialogMask[_dialogIndex];
		var dialogElements = dialog.find('p');
		var dialogButtons = dialog.find('div');
		var templateElements = {};
		var firstElement;
		
		_hotkeyMap = {};
		_hotkeyList = [];
		
		dialog.find('span').text(messageText);
		dialogElements.empty();
		dialogButtons.empty();

		if (template)
		{
			for (var i = 0; i < template.length; i++)
			{
				var item = template[i];
				var element = $('<span></span>');

				element.attr('class', item.class);

				switch (item.type)
				{
					case 'text':
					{
						element.text(dictionary.get(item.text));
						break;
					}
					case 'html':
					{
						element.html(item.html);
						break;
					}
					case 'input':
					case 'email':
					case 'number':
					case 'range':
					case 'search':
					{
						var input = $('<input/>');

						input.attr('type', item.type === 'input' ? 'text' : item.type);
						input.attr('maxlength', item.maxlength);
						input.attr('min', item.min);
						input.attr('max', item.max);
						input.attr('step', item.step);
						input.attr('value', item.default);

						if (item.placeholder)
						{
							input.attr('placeholder', dictionary.get(item.placeholder));
						}

						if (item.onchange)
						{
							input.bind('change', item.onchange);
						}

						templateElements[item.name || item.type + i] = input;
						
						if (!firstElement)
						{
							firstElement = input;
						}

						element.append(input);
						break;
					}
				}

				dialogElements.append(element);
			}
		}

		if (!buttons)
		{
			buttons = [{
				text: 'close',
				default: true,
				cancel: true
			}];
		}

		for (var i = 0; i < buttons.length; i++)
		{
			var button = buttons[i];

			var element = $('<button></button>');				

			element.text(dictionary.get(button.text, button.index));
			element[0].clickEvent = button.onclick; 
			element.on(
				"click",
				function()
				{
					if (this.clickEvent) 
					{
						var returnValue = this.clickEvent(templateElements);

						if (returnValue)
						{
							if (returnValue.then)
							{
								returnValue.then(function()
								{
									CloseDialog();
								});
							}
							return;
						}
					}
					CloseDialog();
				}
			);

			if (button.default)
			{
				_hotkeyMap['Enter'] = element;
			}
			if (button.cancel)
			{
				_hotkeyMap['Escape'] = element;
			}
			if (button.hotkey)
			{
				_hotkeyMap[button.hotkey] = element;
			}

			dialogButtons.append(element);
		}

		if (Object.keys(_hotkeyMap).length > 0)
		{
			_hotkeyList = Object.keys(_hotkeyMap);
			window.addEventListener('keydown', onkeypress);
		}

		dialogMask
			.css({ 'z-index': 1000 + 2 * _dialogIndex })
			.toggleClass('ng-hide', false);
		dialog
			.css({ 'z-index': 1000 + 2 * _dialogIndex + 1 })
			.toggleClass('ng-hide', false);

		if (firstElement)
		{
			firstElement[0].focus();
			if (firstElement[0].select)
			{
				firstElement[0].select();
			}
		}

		return CloseDialog;

		function CloseDialog()
		{
			_dialog[_dialogIndex].toggleClass('ng-hide', true);			
			_dialogMask[_dialogIndex].toggleClass('ng-hide', true);
			--_dialogIndex;

			window.removeEventListener('keydown', onkeypress);

			if (_dialogIndex === -1)
			{
				document.body.style.overflow = '';
			}
		}
	};
})
.service('dialog', function(showDialog, dictionary)
{
	this.ok = function(message)
	{
		showDialog(message);
	};

	this.yesNo = function(message, yesCallback, noCallback)
	{
		showDialog(
			message,
			[
				{
					text: 'yes',
					hotkey: 'Key' + dictionary.get('yes-key'),
					default: true,
					onclick: yesCallback
				},
				{
					text: 'no',
					hotkey: 'Key' + dictionary.get('no-key'),
					cancel: true,
					onclick: noCallback
				}
			]
		);
	};

	this.input = function(message, acceptCallback, cancelCallback, defaultText)
	{
		if (cancelCallback && !angular.isFunction(cancelCallback))
		{
			if (!defaultText)
			{
				defaultText = cancelCallback;
			}
			cancelCallback = function() {};
		}

		showDialog(
			message,
			[
				{
					text: 'ok',
					default: true,
					onclick: function(items)
					{
						return acceptCallback(items['inputText'].val());
					}
				},
				{
					text: 'cancel',
					cancel: true,
					onclick: cancelCallback
				}
			],
			[{
				type: 'input',
				name: 'inputText',
				default: defaultText
			}]
		);
	}
})
.service('cookie', function()
{
	this.read = function(name)
	{
		var cookies = document.cookie.split('; ');
		var match = escape(name) + '=';

		for (var cookie in cookies)
		{
			if (cookie.substr(0, match.length) === match)
			{
				return unescape(cookie.substr(match.length));
			}
		}
	};

	this.write = function(name, value, age)
	{
		document.cookie = escape(name) + '=' + escape(value) + (age ? '; max-age=' + age : '');
	}

	this.delete = function(name)
	{
		document.cookie = escape(name) + '=; max-age=-1';
	}
})
.service('http', function($http, $q, $timeout, cookie, dialog)
{
	var _service = this;
	var _buffer = {};
	var _sendTimer = null;
	var _sendBuffer = [];
	var _sendDeferreds = {};

	_service.options = {
		httpDelay: 10
	};

	_service.start = function(options)
	{
		_service.options = options;
	};

	_service.fetch = function(action, parameters)
	{
		var deferred = $q.defer();

		if (_buffer[action] && angular.equals(parameters, _buffer[action].parameters))
		{
			deferred.resolve(_buffer[action].response);

			if (!_buffer[action].isPermanent)
			{
				delete _buffer[action];
			}
			
			return deferred.promise;
		}

		var requestId = new Date().getTime() + Math.random();
		var userId;

		_sendDeferreds[requestId] = deferred;
		
		if (localStorage && localStorage.getItem)
		{
			userId = localStorage.userId;
		}
		else
		{
			userId = cookie.read('userId');
		}

		var message = {
			requestId: requestId,
			command: action
		};

		if (parameters)
		{
			message.parameters = parameters;
		}

		_sendBuffer.push(message);

		if (_sendTimer)
		{
			$timeout.cancel(_sendTimer);
		}
		_sendTimer = $timeout(
			function()
			{
				$timeout.cancel(_sendTimer);
				_sendTimer = null;

				var sendData = {
					actions: _sendBuffer
				};

				if (userId)
				{
					sendData.userId = userId;
				}
						
				$http({
					method: 'POST',
					url: '/',
					data: sendData
				})
				.then(
					function(responseObject)
					{
						var responseData = responseObject.data;

						if (responseData.userId)
						{
							if (_service.options.permanentId && localStorage && localStorage.setItem)
							{
								localStorage.setItem('userId', responseData.userId);
							}
							else if (sessionStorage && sessionStorage.setItem)
							{
								sessionStorage.setItem('userId', responseData.userId);
							}
							else
							{
								cookie.write('userId', responseData.userId, _service.options.permanentId && (86400 * 365 * 10));
							}
						}

						_buffer = angular.extend(_buffer, responseData.buffer);
						
						for (var r in responseData.responses)
						{
							var response = responseData.responses[r];

							if (response.status === 'error') 
							{
								dialog.ok(response.data);
								deferred.reject(response.data);
								return;
							}
			
							_sendDeferreds[response.requestId].resolve(response.data);
							delete _sendDeferreds[response.requestId];
						}
					},
					function(response, r)
					{
						dialog.ok(response.statusText);
						deferred.reject(response.statusText);
					}
				); // $http.then()

				_sendBuffer = [];
			},
			_service.options.httpDelay || 10
		);
		
		return deferred.promise;
	}; // fetch()
})
.service('webSocket', function($q, cookie, dialog)
{
	var _service = this;
	var _loader = $q.defer();

	_service.options = {};
	_service.loader = _loader.promise;
	_service.onConnect = null;
	_service.onDisconnect = null;
	_service.supported = !!WebSocket;

	if (!_service.supported)
	{
		_loader.resolve();
		return;
	}

	var _webSocket;
	var _requests = {};
	var _listeners = {};
	var _buffer = {};
	var _protocol = (location.protocol === 'https' ? 'wss://' : 'ws://');

	function Connect()
	{
		var webSocket = new WebSocket(_protocol + location.host);

		webSocket.onmessage = function(messageEvent)
		{
			try
			{
				var responseData = JSON.parse(messageEvent.data);
				var deferred = _requests[response.requestId];

				if (responseData.status === 'error') 
				{
					dialog.ok(responseData.data);
					deferred.reject(responseData.data);
					return;
				}

				_buffer = angular.extend(_buffer, responseData.buffer);

				if (responseData.userId)
				{
					if (_service.options.permanentId && localStorage && localStorage.setItem)
					{
						localStorage.setItem('userId', responseData.userId);
					}
					else if (sessionStorage && sessionStorage.setItem)
					{
						sessionStorage.setItem('userId', responseData.userId);
					}
					else
					{
						cookie.write('userId', responseData.userId, _service.options.permanentId && (86400 * 365 * 10));
					}
				}

				for (var key in _listeners)
				{
					if (key === responseData.requestId)
					{
						_listeners[key](responseData.data);
						return;
					}
				}

				deferred.resolve(responseData.data);
			}
			catch (err)
			{
				console.log(err);
				dialog.ok('unknown-error');
			}
		};

		webSocket.onopen = function()
		{
			if (_service.onConnect)
			{
				_service.onConnect();
			}
			_loader.resolve();
		};

		webSocket.onclose = function()
		{
			if (_service.onDisconnect && _service.onDisconnect())
			{
				_webSocket = new Connect();
			}
		};

		return webSocket;
	};

	_service.start = function(options)
	{
		_service.options = options;
		_webSocket = new Connect();
		return _service.loader;
	}

	_service.addListener = function(key, callback)
	{
		_listeners[key] = callback;
	};

	_service.fetch = function(action, parameters)
	{
		if (_buffer[action] && angular.equals(parameters, _buffer[action].parameters))
		{
			var deferred = $q.defer();

			deferred.resolve(_buffer[action].response);

			if (!_buffer[action].isPermanent)
			{
				delete _buffer[action];
			}
			
			return deferred.promise;
		}

		var sendData = {
			requestId: new Date().getTime() + Math.random(),
			action: action
		};

		var userId;

		if (localStorage && localStorage.getItem)
		{
			userId = localStorage.userId;
		}
		else if (sessionlStorage && sessionlStorage.getItem)
		{
			userId = sessionlStorage.userId;
		}
		else
		{
			userId = cookie.read('userId');
		}
		if (userId)
		{
			sendData.userId = userId;
		}

		if (parameters)
		{
			sendData.parameters = parameters;
		}
			
		var deferred = _requests[sendData.requestId] = $q.defer();		

		if (_webSocket.readyState === 1)
		{
			_webSocket.send(JSON.stringify(sendData));
		}
		else
		{
			deferred.reject();
		}

		return deferred.promise;
	};
})
.service('server', function($q, http, webSocket)
{
	var _service = this;
	var _loader = $q.defer();
	var _server;

	_service.loader = _loader.promise;

	_service.start = function(options)
	{
		var services = [];

		options.webSocket = options.webSocket && webSocket.supported;

		http.start(options);

		if (options.webSocket)
		{
			services.push(webSocket.start(options));
		}

		$q.all(services).then(function()
		{
			if (options.webSocket)
			{
				_service.fetch = webSocket.fetch;
				_service.addListener = webSocket.addListener();
				_service.usingWebSocket = true;
				_service.onConnect = options.onConnect;
				_service.onDisonnect = options.onDisconnect;
			}
			else
			{
				_service.fetch = http.fetch;
				_service.addListener = function() { };
				_service.usingWebSocket = false;
			}

			_loader.resolve();
		});
	};

	_service.readStore = function(name, defaultValue)
	{
		var value;

		if (localStorage && localStorage.getItem)
		{
			value = localStorage.getItem(name)
		}
		else
		{
			value = cookie.read(name);
		}
		if (value === undefined)
		{
			return defaultValue;
		}
		try
		{
			return JSON.parse(value);
		}
		catch(err)
		{
			return defaultValue;
		}
	};

	_service.writeStore = function(name, data, isPermanent)
	{
		if (isPermanent && localStorage && localStorage.setItem)
		{
			localStorage.setItem(name, JSON.stringify(data));
			return;
		}
		if (sessionStorage && sessionStorage.setItem)
		{
			sessionStorage.setItem(name, JSON.stringify(data));
			return;
		}

		cookie.write(name, JSON.stringify(data), isPermanent);
	};

	_service.deleteStore = function(name)
	{
		if (localStorage && localStorage.deleteItem)
		{
			delete localStorage.deleteItem(name);
		}
		else
		{
			cookie.delete(name);
		}
	};
})
.directive('unselectable', function()
{
	return {
		restrict: 'A',
		link: function($scope, $element)
		{
			var element = $element[0];
			element.onselectstart = function() { return false; };
			element.style.MozUserSelect = "none";
			element.style.KhtmlUserSelect = "none";
			element.unselectable = "on";
		}
	};
})
.directive('dicText', function($q, dictionary)
{
	return {
		restrict: 'A',
		link: function($scope, $element, $attributes)
		{
			dictionary.loader.then(function()
			{
				$element.html(dictionary.get($attributes.dicText, $attributes.dicIndex));
			});

			$scope.$on(
				'dictionary-setLanguage',
				function()
				{
					$element.html(dictionary.get($attributes.dicText, $attributes.dicIndex));
				}
			);
		}
	}
})
.directive('dicTitle', function($q, dictionary)
{
	return {
		restrict: 'A',
		link: function($scope, $element, $attributes)
		{
			dictionary.loader.then(function()
			{
				$element.attr('title', dictionary.get($attributes.dicTitle, $attributes.dicIndex));
			});

			$scope.$on(
				'dictionary-setLanguage',
				function()
				{
					$element.attr('title', dictionary.get($attributes.dicText, $attributes.dicIndex));
				}
			);
		}
	}
})
.directive('asDate', function()
{
    return {
		require: 'ngModel',
        restrict : 'A',
        link: function ($scope, $element, $attributes, $controller)
		{
			$controller.$formatters.length = 0;
			$controller.$parsers.length = 0;

			$controller.$formatters.push(function(d)
			{
				var dt = new Date(d);
				return dt.getFullYear() + '-' + (dt.getMonth() + 1).padLeft(2) + '-' + dt.getDate().padLeft(2);
			});

            var release = $scope.$watch(
				$attributes.ngModel,
				function (value)
				{
					if (value)
					{
						$scope.ngModel = new Date(value);
					}
				}
			);

			$scope.$on('$destroy', function()
			{
				release();
			});
        }
    }
})
.filter('formatDate', function(dictionary)
{
	var filter = function(date)
	{
		var dt = new Date(date);

		if (dt == 'Invalid date')
		{
			return '';
		}
		return dictionary.formatDate(dt);
	};

	filter.$stateful = true;

	return filter;
})
.filter('formatDateTime', function(dictionary)
{
	var filter = function(date)
	{
		var dt = new Date(date);

		if (dt == 'Invalid date')
		{
			return '';
		}
		return dictionary.formatDate(dt, '_datetime');
	}

	filter.$stateful = true;

	return filter;
});