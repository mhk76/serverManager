Number.prototype.leftPad = function(length, padChar)
{
	var output = this.toString();

	if (output.length < length)
	{
		return (padChar || '0').toString().substr(0, 1).repeat(length - output.length) + output;
	}

	return output.slice(-length);
};

String.prototype.appendTrail = function(trail)
{
	if (typeof trail !== 'string' || trail.length === 0)
	{
		throw 'Invalid trail string';
	}
	if (this.slice(-trail.length) !== trail)
	{
		return this + trail;
	}
	return this;
};

Object.equals = function(object1, object2, softComparison)
{
	if (object1 === object2 || (softComparison && object1 == object2))
	{
		return true;
	}
	if (object1 === null || object2 === null || object1 === undefined || object2 === undefined)
	{
		return false;
	}

	let type1 = typeof object1;

	if (type1 !== typeof object2 || type1 === 'string' || type1 === 'number' || type1 === 'boolean')
	{
		return false;
	}
	if (object1 instanceof Date)
	{
		return +object1 === +object2;
	}
	if (object1 instanceof Function)
	{
		return false;
	}

	var keys = Object.keys(object1);
	
	if (!keys.equals(Object.keys(object2)))
	{
		return false;
	}

    for (var i in keys)
	{
		var key = keys[i];

		if (object1[key] instanceof Function)
		{
			continue;
		}
		if (object1[key] === object2[key])
		{
			continue;
		}

		if (Array.isArray(object1[key]) && !object1.equals(object2[key], !softComparison, softComparison))
		{
			return false;
		}

		if (!Object.equals(object1[key], object2[key], softComparison))
		{
			return false;
		}
    }

    return true;
} 

Array.prototype.equals = function(array, deepComparison, softComparison)
{
	if (!Array.isArray(array))
	{
		return false;
	}
	if (this.length !== array.length)
	{
		return false;
	}

	return this.every((value, index) =>
		{
			if (deepComparison && Array.isArray(value))
			{
				if (!Array.isArray(array[index]))
				{
					return false;
				}
				return value.equals(array[index], deepComparison, softComparison);
			}
			return Object.equals(value, array[index], softComparison);
		});
}
Object.defineProperty(Array.prototype, "equals", { enumerable: false });

Array.prototype.intersect = function(array, softComparison)
{
	if (!Array.isArray(array))
	{
		return false;
	}
	return this.some((thisValue) =>
		{
			return array.some((arrayValue) =>
			{
				return Object.equals(thisValue, arrayValue, softComparison);
			});
		});
}
Object.defineProperty(Array.prototype, "intersect", { enumerable: false });
