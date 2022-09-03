class NUM
{
	static clamp(value, min, max) { return Math.max(min, Math.min(value, max)); }
	static between(value, min, max) { return (value >= min && value <= max); }
	static timestamp() { return new Date().getTime(); }
	static interpolate(a, b, percent) { return a + (b - a) * percent; }
	static randomInt(min, max) { return Math.round(NUM.interpolate(min, max, Math.random())); }
	static distance(x1, y1, x2, y2) { return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)); }

	static normalizeAngle(angle)
	{
		angle = angle % (2 * Math.PI);
		angle = (angle < 0)? (2 * Math.PI) + angle : angle;

		return angle;
	}
}