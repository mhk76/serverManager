'use strict'

String.prototype.appendTrail = function(trail)
{
	if (typeof trail !== 'string' || trail.length === 0)
	{
		throw 'Invalid trail string'
	}
	if (this.slice(-trail.length) !== trail)
	{
		return this + trail
	}
	return this
}

Object.equals = function(object1, object2, softComparison)
{
	if (object1 === object2 || (softComparison && object1 == object2))
	{
		return true
	}
	if (object1 === null || object2 === null || object1 === undefined || object2 === undefined)
	{
		return false
	}

	let type1 = typeof object1
	let type2 = typeof object2

	if (type1 !== type2 || ['string', 'number', 'boolean'].includes(type1) || ['string', 'number', 'boolean'].includes(type2))
	{
		return false
	}
	if (object1 instanceof Date)
	{
		return +object1 === +object2
	}
	if (object1 instanceof Function)
	{
		return false
	}

	let keys = Object.keys(object1)
	
	if (!keys.equals(Object.keys(object2)))
	{
		return false
	}

    for (let i in keys)
	{
		let key = keys[i]

		if (object1[key] instanceof Function)
		{
			continue
		}
		if (object1[key] === object2[key])
		{
			continue
		}

		if (Array.isArray(object1[key]) && !object1.equals(object2[key], !softComparison, softComparison))
		{
			return false
		}

		if (!Object.equals(object1[key], object2[key], softComparison))
		{
			return false
		}
    }

    return true
} 

Array.prototype.equals = function(array, deepComparison, softComparison)
{
	if (!Array.isArray(array))
	{
		return false
	}
	if (this.length !== array.length)
	{
		return false
	}

	return this.every((value, index) =>
		{
			if (deepComparison && Array.isArray(value))
			{
				if (!Array.isArray(array[index]))
				{
					return false
				}
				return value.equals(array[index], deepComparison, softComparison)
			}
			return Object.equals(value, array[index], softComparison)
		})
}
Object.defineProperty(Array.prototype, "equals", { enumerable: false })
