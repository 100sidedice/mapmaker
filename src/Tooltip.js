class TooltipManager {
	constructor() {
		this.tooltip = document.createElement("div");
		this.tooltip.id = "tooltip";
		this.tooltip.classList.add("tooltip");
		document.body.appendChild(this.tooltip);

		this.targets = new Map();
		this.target = null;
		this.timeout = null;
	}

	/**
	 * Adds a tooltip to an element.
	 * @param {HTMLElement} element - Element to attach the tooltip to.
	 * @param {string} text - Tooltip text.
	 */
	addTooltip(element, text) {
		this.removeTooltip(element);

		const mouseEnter = () => {
			this.show(element, text);
		};

		const mouseLeave = () => {
			this.hide(element);
		};

		element.addEventListener("mouseenter", mouseEnter);
		element.addEventListener("mouseleave", mouseLeave);

		this.targets.set(element, { mouseEnter, mouseLeave });
	}

	/**
	 * Removes a tooltip from an element.
	 * @param {HTMLElement} element - Element to remove the tooltip from.
	 */
	removeTooltip(element) {
		const handlers = this.targets.get(element);

		if (!handlers) {
			return;
		}

		element.removeEventListener("mouseenter", handlers.mouseEnter);
		element.removeEventListener("mouseleave", handlers.mouseLeave);

		this.targets.delete(element);

		if (this.target === element) {
			this.hide(element);
		}
	}

	/**
	 * Shows a tooltip after the configured delay.
	 * @param {HTMLElement} element - Element being hovered.
	 * @param {string} text - Tooltip text.
	 */
	show(element, text) {
		this.clearTimeout();

		// if element does not exist, do not show tooltip
		if (!element) {
			// remove any existing tooltips
			this.hide();
			return;
		}
		// if the pos is invalid, or less then 0,0
		const rect = element.getBoundingClientRect();
		if (rect.left < 0 || rect.top < 0) {
			// remove any existing tooltips
			this.hide();
			return;
		}
		// if element is not visible, do not show tooltip
		if (!element.offsetParent) {
			// remove any existing tooltips
			this.hide();
			return;
		}
		// if display is none, do not show tooltip
		if (window.getComputedStyle(element).display === "none") {
			// remove any existing tooltips
			this.hide();
			return;
		}

		this.target = element;

		this.timeout = setTimeout(() => {
			if (this.target !== element) {
				return;
			}

			this.tooltip.textContent = text;
			this.tooltip.classList.add("visible");
			this.position(element);
		}, 500);
	}

	/**
	 * Hides the tooltip if the given element is currently active.
	 * @param {HTMLElement} element - Element that was left.
	 */
	hide(element) {
		if (this.target !== element) {
			return;
		}

		this.clearTimeout();
		this.target = null;
		this.tooltip.classList.remove("visible");
	}

	/**
	 * Positions the tooltip below its target.
	 * @param {HTMLElement} element - Element being hovered.
	 */
	position(element) {
		const rect = element.getBoundingClientRect();

		this.tooltip.style.left = `${rect.left + rect.width / 2}px`;
		this.tooltip.style.top = `${rect.bottom + 6}px`;
	}

	/**
	 * Clears the pending tooltip timeout.
	 */
	clearTimeout() {
		if (this.timeout === null) {
			return;
		}

		clearTimeout(this.timeout);
		this.timeout = null;
	}
}

const tooltipManager = new TooltipManager();

/**
 * Adds a tooltip to an element.
 * @param {HTMLElement} element - Element to attach the tooltip to.
 * @param {string} text - Tooltip text.
 */
export function addTooltip(element, text) {
	tooltipManager.addTooltip(element, text);
}

/**
 * Removes a tooltip from an element.
 * @param {HTMLElement} element - Element to remove the tooltip from.
 */
export function removeTooltip(element) {
	if (!element) {
		return;
	}

	tooltipManager.removeTooltip(element);
}

/**
 * Converts all tooltip attributes in the document to managed tooltips.
 */
export function initializeTooltips() {
	const elements = document.querySelectorAll("[tooltip]");

	elements.forEach(element => {
		const text = element.getAttribute("tooltip");

		if (!text) {
			return;
		}

		element.removeAttribute("tooltip");
		tooltipManager.addTooltip(element, text);
	});
}

/**
 * Hides the currently visible tooltip.
 */
export function clearTooltip() {
	tooltipManager.hide();
}