export default class DiceRoller {
	/**
	 * Creates a dice roller.
	 *
	 * @param {number} maxDice
	 * @param {number} maxSides
	 */
	constructor(maxDice = 100, maxSides = 10000) {
		this.maxDice = maxDice;
		this.maxSides = maxSides;
	}

	/**
	 * Evaluates a complete dice expression.
	 *
	 * @param {string} expression
	 * @returns {{total: number, breakdown: string}}
	 */
	roll(expression) {
		const cleaned = expression.replace(/\s+/g, " ").trim();
		const dicePattern = /(\d*)d(\d+)/gi;

		let total = 0;
		let lastIndex = 0;
		const breakdown = [];
		let match;

		while ((match = dicePattern.exec(cleaned)) !== null) {
			const arithmetic = cleaned.slice(lastIndex, match.index).trim();

			if (arithmetic) {
				total += this.evaluateArithmetic(arithmetic);
			}

			const count = Number(match[1] || 1);
			const sides = Number(match[2]);

			this.validateDice(count, sides);

			const modifierData = this.parseFollowingModifiers(
				cleaned,
				dicePattern.lastIndex
			);

			const roll = this.rollPool(
				count,
				sides,
				modifierData.mode
			);

			let result = roll.total;

			breakdown.push(roll.breakdown);

			for (const modifier of modifierData.modifiers) {
				result = this.applyModifier(result, modifier);

				breakdown.push(
					`${modifier.operator}${modifier.value} → ${result}`
				);
			}

			total += result;
			lastIndex = modifierData.endIndex;
			dicePattern.lastIndex = modifierData.endIndex;
		}

		const remaining = cleaned.slice(lastIndex).trim();

		if (remaining) {
			total += this.evaluateArithmetic(remaining);
		}

		if (!breakdown.length) {
			throw new Error("No dice found.");
		}

		return {
			total,
			breakdown: breakdown.join(" | ")
		};
	}

    	/**
	 * Parses all parenthesized modifiers immediately following a dice group.
	 *
	 * @param {string} expression
	 * @param {number} startIndex
	 * @returns {{mode: string|null, modifiers: Array, endIndex: number}}
	 */
	parseFollowingModifiers(expression, startIndex) {
		const modifiers = [];
		let mode = null;
		let index = startIndex;

		while (true) {
			const remaining = expression.slice(index);
			const match = remaining.match(/^\s*\(\s*([^)]*)\s*\)/);

			if (!match) break;

			const parsed = this.parseModifier(match[1]);

			if (parsed.mode) {
				if (mode && mode !== parsed.mode) {
					throw new Error("A dice group cannot use multiple roll modes.");
				}

				mode = parsed.mode;
			}

			if (parsed.operator) {
				modifiers.push({
					operator: parsed.operator,
					value: parsed.value
				});
			}

			index += match[0].length;
		}

		return {
			mode,
			modifiers,
			endIndex: index
		};
	}
	/**
	 * Validates a dice definition.
	 *
	 * @param {number} count
	 * @param {number} sides
	 */
	validateDice(count, sides) {
		if (count < 0 || count > this.maxDice) {
			throw new Error("Invalid dice count.");
		}

		if (sides < 2 || sides > this.maxSides) {
			throw new Error("Invalid dice size.");
		}
	}

	/**
	 * Parses a dice modifier.
	 *
	 * @param {string|undefined} modifierText
	 * @returns {{mode: string|null, operator: string|null, value: number|null}}
	 */
	parseModifier(modifierText) {
		if (!modifierText) {
			return {
				mode: null,
				operator: null,
				value: null
			};
		}

		const text = modifierText.trim().toLowerCase();

		const modifierMatch = text.match(
			/^([+\-*/])\s*(\d+(?:\.\d+)?)$/
		);

		if (modifierMatch) {
			return {
				mode: null,
				operator: modifierMatch[1],
				value: Number(modifierMatch[2])
			};
		}

		const modeMatch = text.match(
			/^(advantage|disadvantage|adv|dis|adv-all|dis-all)(?:\s*([+\-*/])\s*(\d+(?:\.\d+)?))?$/
		);

		if (modeMatch) {
			const mode = {
				advantage: "adv",
				disadvantage: "dis",
				adv: "adv",
				dis: "dis",
				"adv-all": "adv-all",
				"dis-all": "dis-all"
			}[modeMatch[1]];

			return {
				mode,
				operator: modeMatch[2] || null,
				value: modeMatch[3] ? Number(modeMatch[3]) : null
			};
		}

		throw new Error(`Invalid dice modifier: (${modifierText})`);
	}

	/**
	 * Rolls a dice pool according to its roll mode.
	 *
	 * @param {number} count
	 * @param {number} sides
	 * @param {string|null} mode
	 * @returns {{total: number, breakdown: string}}
	 */
	rollPool(count, sides, mode) {
		if (mode === "adv" || mode === "dis") {
			return this.rollPoolAsGroup(count, sides, mode);
		}

		if (mode === "adv-all" || mode === "dis-all") {
			return this.rollPoolIndividually(count, sides, mode);
		}

		const results = this.rollNormal(count, sides);

		return {
			total: this.sum(results),
			breakdown: `${results.join(", ")} = ${this.sum(results)}`
		};
	}

	/**
	 * Rolls two complete pools and keeps the better or worse pool.
	 *
	 * @param {number} count
	 * @param {number} sides
	 * @param {"adv"|"dis"} mode
	 * @returns {{total: number, breakdown: string}}
	 */
	rollPoolAsGroup(count, sides, mode) {
		const first = this.rollNormal(count, sides);
		const second = this.rollNormal(count, sides);

		const firstTotal = this.sum(first);
		const secondTotal = this.sum(second);

		const total = mode === "adv"
			? Math.max(firstTotal, secondTotal)
			: Math.min(firstTotal, secondTotal);

		return {
			total,
			breakdown:
				`${mode}: (${first.join(", ")} = ${firstTotal}) ` +
				`vs (${second.join(", ")} = ${secondTotal}) → ${total}`
		};
	}

	/**
	 * Rolls each die twice and independently keeps the better or worse result.
	 *
	 * @param {number} count
	 * @param {number} sides
	 * @param {"adv-all"|"dis-all"} mode
	 * @returns {{total: number, breakdown: string}}
	 */
	rollPoolIndividually(count, sides, mode) {
		const results = [];

		for (let i = 0; i < count; i++) {
			const first = this.rollDie(sides);
			const second = this.rollDie(sides);

			results.push(
				mode === "adv-all"
					? Math.max(first, second)
					: Math.min(first, second)
			);
		}

		const total = this.sum(results);

		return {
			total,
			breakdown: `${mode}: ${results.join(", ")} = ${total}`
		};
	}

	/**
	 * Rolls a pool normally.
	 *
	 * @param {number} count
	 * @param {number} sides
	 * @returns {number[]}
	 */
	rollNormal(count, sides) {
		const results = [];

		for (let i = 0; i < count; i++) {
			results.push(this.rollDie(sides));
		}

		return results;
	}

	/**
	 * Rolls a single die.
	 *
	 * @param {number} sides
	 * @returns {number}
	 */
	rollDie(sides) {
		return Math.floor(Math.random() * sides) + 1;
	}

	/**
	 * Sums dice results.
	 *
	 * @param {number[]} results
	 * @returns {number}
	 */
	sum(results) {
		return results.reduce((sum, value) => sum + value, 0);
	}

	/**
	 * Applies an arithmetic modifier to a dice result.
	 *
	 * @param {number} total
	 * @param {{operator: string|null, value: number|null}} modifier
	 * @returns {number}
	 */
	applyModifier(total, modifier) {
		if (!modifier.operator) return total;

		switch (modifier.operator) {
			case "+":
				return total + modifier.value;
			case "-":
				return total - modifier.value;
			case "*":
				return total * modifier.value;
			case "/":
				if (modifier.value === 0) {
					throw new Error("Cannot divide a dice result by zero.");
				}

				return total / modifier.value;
			default:
				throw new Error(`Invalid modifier: ${modifier.operator}`);
		}
	}

	/**
	 * Evaluates arithmetic containing only numbers and operators.
	 *
	 * @param {string} expression
	 * @returns {number}
	 */
	evaluateArithmetic(expression) {
		if (!/^[\d\s+\-*/().]+$/.test(expression)) {
			throw new Error(`Invalid arithmetic: ${expression}`);
		}

		const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/]/g);

		if (!tokens) {
			throw new Error(`Invalid arithmetic: ${expression}`);
		}

		const values = [];
		const operators = [];
		const precedence = {
			"+": 1,
			"-": 1,
			"*": 2,
			"/": 2
		};

		const applyOperator = () => {
			const operator = operators.pop();

			if (operator === "(") {
				throw new Error("Invalid parentheses.");
			}

			const right = values.pop();
			const left = values.pop();

			if (left === undefined || right === undefined) {
				throw new Error("Invalid arithmetic expression.");
			}

			switch (operator) {
				case "+":
					values.push(left + right);
					break;
				case "-":
					values.push(left - right);
					break;
				case "*":
					values.push(left * right);
					break;
				case "/":
					if (right === 0) throw new Error("Division by zero.");
					values.push(left / right);
					break;
			}
		};

		for (const token of tokens) {
			if (!isNaN(token)) {
				values.push(Number(token));
				continue;
			}

			if (token === "(") {
				operators.push(token);
				continue;
			}

			if (token === ")") {
				while (operators.length && operators.at(-1) !== "(") {
					applyOperator();
				}

				if (operators.pop() !== "(") {
					throw new Error("Invalid parentheses.");
				}

				continue;
			}

			while (
				operators.length &&
				operators.at(-1) !== "(" &&
				precedence[operators.at(-1)] >= precedence[token]
			) {
				applyOperator();
			}

			operators.push(token);
		}

		while (operators.length) {
			if (operators.at(-1) === "(") {
				throw new Error("Invalid parentheses.");
			}

			applyOperator();
		}

		if (values.length !== 1) {
			throw new Error("Invalid arithmetic expression.");
		}

		return values[0];
	}
}