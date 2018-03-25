'use strict'

const $assert = require('chai').assert
const $http = require('http')
const $fs = require('fs')
const $ws = require('ws')

describe('ServerManager', () =>
{
	let _serverManager

	before(() =>
	{
		return new Promise((resolve) =>
		{
			require('../serverManager.js')({
				"server": {
					"file": "../../../test/server.js",
				},
				"web": {
					"root": "../../../test/",
					"defaultFile": "client.html",
					"protocol": "http",
					"port": 8765,
					"webSockets": true
				},
				"log": {
					"format": "off"
				},
				"cache": {
					"format": "off"
				}
			}).then((serverManager) =>
			{
				_serverManager = serverManager
				resolve()
			})
		})
	})

	it('GET', (done) =>
	{
		let doneCount = 0

		$http.get(
			_serverManager.config.web.protocol + '://localhost:' + _serverManager.config.web.port + '/client.html',
			(response) =>
			{
				responseHandler(response, './test/client.html')
			}
		)

		let files = [
			'serverManagerTools.angular.js',
			'serverManagerTools.jquery.js',
			'serverManagerDialog.css'
		]
		
		files.forEach((filename) =>
		{
			$http.get(
				_serverManager.config.web.protocol + '://localhost:' + _serverManager.config.web.port + '/' + filename,
				(response) =>
				{
					responseHandler(response, filename)
				}
			)
		})

		function responseHandler(response, filename)
		{
			$assert(response.statusCode, 200, 'Status 200')

			let responseData = []

			response.setEncoding('utf8')
			response
				.on('data', (data) =>
				{
					responseData.push(data)
				})
				.on('end', () =>
				{
					$assert(
						$fs.readFileSync(filename.replace('.js', '.min.js'), 'utf8'),
						responseData,
						filename
					)
					++doneCount

					if (doneCount === (1 + files.length))
					{
						done()
					}
				})
		}
	})

	it('POST and WebSocket', (done) =>
	{
		let postData = JSON.stringify({
			userId: 'uid',
			actions: [
				{ requestId: 'http0', action: 'one' },
				{ requestId: 'http1', action: 'three' }
			]
		})

		let request = $http.request(
			{
				host: 'localhost',
				port: 8765,
				path: '/',
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': postData.length
				}
			},
			responseHandler
		)

		request.write(postData)
		request.end()

		let webSocket = new $ws('ws://localhost:8765/')

		webSocket.on('message', (messageData) =>
		{
			resultsHandler(messageData)
		})

		webSocket.on('open', () =>
		{
			webSocket.send(JSON.stringify({ requestId: 'ws0', userId: 'uid', action: 'zero' }))
			webSocket.send(JSON.stringify({ requestId: 'ws1', userId: 'uid', action: 'two' }))
		})

		function responseHandler(response)
		{
			let responseData = []

			response.setEncoding('utf8')
			response
				.on('data', (data) =>
				{
					responseData.push(data)
				})
				.on('end', () =>
				{
					resultsHandler(responseData.join(''))
				})
		}

		let _doneCount = 0
		function resultsHandler(data)
		{
			let json

			try
			{
				json = JSON.parse(data)
			}
			catch (error)
			{
				$assert.fail({}, null, 'Not JSON')
			}

			if (json.requestId === 'ws0')
			{
				$assert(
					json,
					{ requestId: 'ws0', userId: 'uid', status: 'ok', data: 'zero', buffer: { buffer: { parameters: 'values', response: 'data', isPermanent: false } } },
					'WebSocket response #1'
				)
				++_doneCount
			}
			else if (json.requestId === 'ws1')
			{
				$assert(
					json,
					{ requestId: 'ws1', userId: 'uid', status: 'ok', data: 'two' },
					'WebSocket response #2'
				)
				++_doneCount
			}
			else if (json.requestId === 'all')
			{
				$assert(
					json,
					{ requestId: 'all', userId: 'uid', status: 'ok',  data: 'broadcast' },
					'WebSocket broadcast'
				)
				++_doneCount
			}
			else
			{
				$assert(
					json.responses.http0,
					{ userId: 'uid', responses: { http0: { status: 'ok', data: 'one' }, http1: { status: 'ok', data: 'three' }, all: { status: 'ok', data: 'broadcast' } }, buffer: { buffer: { parameters: 'values', response: 'data', isPermanent: false } } },
					'WebSocket broadcast'
				)
				++_doneCount
			}

			if (_doneCount === 4)
			{
				done()
			}
		} // resultsHandler()

	}) // it()

	after(() =>
	{
		process.exit()
	})

}) // describe('ServerManager')