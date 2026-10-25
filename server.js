const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;

const MIME_TYPES = {
	".html": "text/html; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".webp": "image/webp",
};

const server = http.createServer((req, res) => {
	const cleanUrl = req.url.split("?")[0].split("#")[0];
	let relativePath = decodeURIComponent(cleanUrl);
	if (relativePath === "/" || relativePath === "") {
		relativePath = "/index.html";
	}

	const safePath = path.normalize(path.join(BASE_DIR, relativePath));

	// Prevent directory traversal
	if (!safePath.startsWith(BASE_DIR)) {
		res.writeHead(403, { "Content-Type": "text/plain" });
		res.end("403 Forbidden");
		return;
	}

	fs.stat(safePath, (err, stats) => {
		if (err || !stats.isFile()) {
			res.writeHead(404, { "Content-Type": "text/plain" });
			res.end("404 Not Found");
			return;
		}

		const ext = path.extname(safePath).toLowerCase();
		const contentType = MIME_TYPES[ext] || "application/octet-stream";

		res.writeHead(200, {
			"Content-Type": contentType,
			"Cache-Control": "no-cache",
		});

		fs.createReadStream(safePath).pipe(res);
	});
});

server.listen(PORT, () => {
	console.log(`Server running at http://localhost:${PORT}/`);
	console.log(`Open http://localhost:${PORT}/index.html to view Login`);
	console.log(`Open http://localhost:${PORT}/menu.html to view Menu`);
});
