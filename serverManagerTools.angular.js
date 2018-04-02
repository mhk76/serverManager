'use strict';

angular.module('ServerManagerAngularTools', [])
.service('cookie', function()
{
	this.read = function(name)
	{
		let cookies = document.cookie.split('; ');
		let match = escape(name) + '=';

		for (let cookie in cookies)
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
.service('http', function($http, $q, $timeout, cookie)
{
	let _service = this;
	let _buffer = {};
	let _sendTimer = null;
	let _sendBuffer = [];
	let _sendDeferreds = {};

	_service.options = {
		httpDelay: 10
	};

	_service.start = function(options)
	{
		_service.options = options;
	};

	_service.fetch = function(action, parameters)
	{
		let deferred = $q.defer();

		if (_buffer[action] && angular.equals(parameters, _buffer[action].parameters))
		{
			deferred.resolve(_buffer[action].response);

			if (!_buffer[action].isPermanent)
			{
				delete _buffer[action];
			}
			
			return deferred.promise;
		}

		let requestId = new Date().getTime() + Math.random();
		let userId;

		_sendDeferreds[requestId] = deferred;
		
		if (localStorage && localStorage.getItem)
		{
			userId = localStorage.userId;
		}
		else
		{
			userId = cookie.read('userId');
		}

		let requestData = {
			requestId: requestId,
			action: action
		};

		if (parameters)
		{
			requestData.parameters = parameters;
		}

		_sendBuffer.push(requestData);

		if (_sendTimer)
		{
			$timeout.cancel(_sendTimer);
		}
		_sendTimer = $timeout(
			function()
			{
				$timeout.cancel(_sendTimer);
				_sendTimer = null;

				let sendData = {
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
						let responseData = responseObject.data;

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
						
						for (let requestId in responseData.responses)
						{
							let response = responseData.responses[requestId];

							if (response.status === 'error') 
							{
								deferred.reject(response.data);
								return;
							}
		
							_sendDeferreds[requestId].resolve(response.data);
							delete _sendDeferreds[requestId];
						}
					},
					function(response, r)
					{
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
.service('webSocket', function($q, $rootScope, cookie)
{
	let _service = this;
	let _loader = $q.defer();

	_service.options = {};
	_service.loader = _loader.promise;
	_service.supported = !!WebSocket;

	if (!_service.supported)
	{
		_loader.resolve();
		return;
	}

	let _webSocket;
	let _requests = {};
	let _listeners = {};
	let _buffer = {};
	let _protocol = (location.protocol === 'https' ? 'wss://' : 'ws://');

	$rootScope.$on(
		'websocket_connect',
		function()
		{
			_webSocket = new Connection()
		}
	);

	function Connection()
	{
		let webSocket = new WebSocket(_protocol + location.host);

		webSocket.onmessage = function(messageEvent)
		{
			try
			{
				let responseData = JSON.parse(messageEvent.data);
				let deferred = _requests[responseData.requestId];

				if (responseData.status === 'error') 
				{
					deferred.reject(responseData.data);
					return;
				}

				if (responseData.buffer)
				{
					_buffer = angular.extend(_buffer, responseData.buffer);
				}

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

				for (let key in _listeners)
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
			}
		};

		webSocket.onopen = function()
		{
			$rootScope.$broadcast('websocket_onconnect');
			_loader.resolve();
		};

		webSocket.onclose = function()
		{			
			$rootScope.$broadcast('websocket_ondisconnect');
		};

		return webSocket;
	};

	_service.start = function(options)
	{
		_service.options = options;
		_webSocket = new Connection();
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
			let deferred = $q.defer();

			deferred.resolve(_buffer[action].response);

			if (!_buffer[action].isPermanent)
			{
				delete _buffer[action];
			}
			
			return deferred.promise;
		}

		let sendData = {
			requestId: new Date().getTime() + Math.random(),
			action: action
		};

		let userId;

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
			
		let deferred = _requests[sendData.requestId] = $q.defer();		

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
	let _service = this;
	let _loader = $q.defer();
	let _server;

	_service.loader = _loader.promise;

	_service.start = function(options)
	{
		let services = [];

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
		let value;

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
});