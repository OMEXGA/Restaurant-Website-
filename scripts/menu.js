import {
	onAuthStateChanged,
	signOut,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {
	addDoc,
	collection,
	deleteDoc,
	doc,
	getDoc,
	onSnapshot,
	serverTimestamp,
	updateDoc,
	writeBatch,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";

const restaurantId = "main";
const accountName = document.querySelector("#account-name");
const accountAvatar = document.querySelector("#account-avatar");
const message = document.querySelector("#menu-message");
const signOutButton = document.querySelector("#sign-out");
const sidebar = document.querySelector("#menu-sidebar");
const mobileMenuToggle = document.querySelector("#mobile-menu-toggle");
const sidebarBackdrop = document.querySelector("#sidebar-backdrop");
const storageNote = document.querySelector("#storage-note");
const navButtons = [...document.querySelectorAll("[data-view]")];
const views = [...document.querySelectorAll("[data-panel]")];
const sectionName = document.querySelector("#current-section");
const canvas = document.querySelector("#floorplan-canvas");
const floorplanStage = document.querySelector(".floorplan-stage");
const tableLayer = document.querySelector("#table-layer");
const tableInspector = document.querySelector("#table-inspector");
const inspectorDragHandle = document.querySelector("#inspector-drag-handle");
const rotationInput = document.querySelector("#inspector-rotation");
const rotationOutput = document.querySelector("#inspector-rotation-value");
const requestForm = document.querySelector("#request-form");
const foodForm = document.querySelector("#food-form");
const categoryForm = document.querySelector("#category-form");
const foodCategorySelect = document.querySelector("#food-category");

let currentUser = null;
let currentUserName = "";
let isAdmin = false;
let isManager = false;
let tables = [];
let tableDraft = null;
let layoutPreview = null;
let foods = [];
let foodCategories = [];
let requests = [];
let selectedTableId = null;
let seedAttempted = false;
let categorySeedAttempted = false;
let foodSeedAttempted = false;
let skipNextClick = false;
let unsubscribeData = [];

/**
 * Compress and resize an image File to a JPEG base64 data-URL.
 * Max dimensions: 480 × 360 px. Quality: 82 %.
 * @param {File} file
 * @returns {Promise<string>} data URL
 */
function compressImage(file) {
	return new Promise((resolve, reject) => {
		const MAX_W = 480;
		const MAX_H = 360;
		const reader = new FileReader();
		reader.onload = (event) => {
			const img = new Image();
			img.onload = () => {
				const ratio = Math.min(1, MAX_W / img.width, MAX_H / img.height);
				const canvas = document.createElement("canvas");
				canvas.width = Math.round(img.width * ratio);
				canvas.height = Math.round(img.height * ratio);
				const ctx = canvas.getContext("2d");
				ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
				resolve(canvas.toDataURL("image/jpeg", 0.82));
			};
			img.onerror = reject;
			img.src = event.target.result;
		};
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});
}

const starterTables = [
	{ label: "B5", x: 20, y: 12 }, { label: "B6", x: 50, y: 12 }, { label: "B7", x: 80, y: 12 },
	{ label: "B4", x: 20, y: 24 }, { label: "B8", x: 50, y: 24 }, { label: "B9", x: 80, y: 24 },
	{ label: "B3", x: 20, y: 42 }, { label: "A1", x: 50, y: 46 }, { label: "A2", x: 80, y: 46 },
	{ label: "B2", x: 20, y: 57 }, { label: "A3", x: 50, y: 60 }, { label: "A4", x: 80, y: 60 },
	{ label: "B1", x: 20, y: 72 }, { label: "A5", x: 50, y: 74 }, { label: "A7", x: 80, y: 74 },
	{ label: "A6", x: 50, y: 86 }, { label: "A8", x: 80, y: 86 },
];

function restaurantCollection(name) {
	return collection(db, "restaurants", restaurantId, name);
}

function restaurantDocument(name, id) {
	return doc(db, "restaurants", restaurantId, name, id);
}

function renderFoodCategories(selectedValue = foodCategorySelect.value) {
	foodCategorySelect.replaceChildren();
	const placeholder = document.createElement("option");
	placeholder.value = "";
	placeholder.textContent = "Select category";
	foodCategorySelect.append(placeholder);
	for (const category of foodCategories) {
		const option = document.createElement("option");
		option.value = category.name;
		option.textContent = category.name;
		option.selected = category.name === selectedValue;
		foodCategorySelect.append(option);
	}
}

async function seedDefaultFoodCategories() {
	if (!isAdmin || categorySeedAttempted || foodCategories.length > 0) return;
	categorySeedAttempted = true;
	const defaults = [
		{ id: "meat", name: "Meat" },
		{ id: "seafood", name: "Seafood" },
		{ id: "vegetables", name: "Vegetables" },
	];
	const batch = writeBatch(db);
	for (const category of defaults) {
		batch.set(restaurantDocument("foodCategories", category.id), {
			name: category.name,
			createdBy: currentUser.uid,
			createdAt: serverTimestamp(),
		});
	}
	try {
		await batch.commit();
	} catch {
		categorySeedAttempted = false;
		showMessage("Default food categories could not be loaded. Check your Firestore rules.");
	}
}

const sampleFoods = [
	{
		FoodId: 101,
		FoodName: "Grilled Ribeye Steak",
		FoodCategory: "Meat",
		FoodDetail: "Tender grilled ribeye steak served with fresh roasted asparagus",
		FoodQuantity: 20,
		FoodPrice: 28.5,
		FoodImageUrl: "images/Food/steak.png",
	},
	{
		FoodId: 102,
		FoodName: "Garlic Butter Shrimp",
		FoodCategory: "Seafood",
		FoodDetail: "Jumbo king prawns pan-seared with garlic butter, sea salt, and cilantro",
		FoodQuantity: 15,
		FoodPrice: 22,
		FoodImageUrl: "images/Food/shrimp.png",
	},
	{
		FoodId: 103,
		FoodName: "Mediterranean Tuna Salad",
		FoodCategory: "Vegetables",
		FoodDetail: "Crisp garden salad with artichoke hearts, chickpeas, cucumber, and onions",
		FoodQuantity: 30,
		FoodPrice: 14.5,
		FoodImageUrl: "images/Food/salad.png",
	},
];

async function seedDefaultFoods() {
	if (!isAdmin && !isManager) return;
	if (foodSeedAttempted || foods.length > 0) return;
	foodSeedAttempted = true;
	const batch = writeBatch(db);
	for (const food of sampleFoods) {
		batch.set(restaurantDocument("foods", String(food.FoodId)), {
			...food,
			createdBy: currentUser?.uid ?? "starter",
			createdAt: serverTimestamp(),
			approvedBy: "starter",
			updatedAt: serverTimestamp(),
		});
	}
	try {
		await batch.commit();
	} catch (error) {
		foodSeedAttempted = false;
		console.warn("Could not seed default foods:", error);
	}
}

function setView(name) {
	for (const button of navButtons) {
		const active = button.dataset.view === name;
		button.classList.toggle("is-active", active);
		if (active) {
			button.setAttribute("aria-current", "page");
		} else {
			button.removeAttribute("aria-current");
		}
	}

	for (const view of views) {
		const active = view.dataset.panel === name;
		view.hidden = !active;
		view.classList.toggle("is-visible", active);
	}

	sectionName.textContent = navButtons.find((button) => button.dataset.view === name)?.textContent.trim() ?? "Workspace";
	sidebar.classList.remove("is-open");
	mobileMenuToggle.setAttribute("aria-expanded", "false");
	sidebarBackdrop.hidden = true;
}

function createTextElement(tag, className, text) {
	const element = document.createElement(tag);
	element.className = className;
	element.textContent = text;
	return element;
}

for (const button of navButtons) {
	button.addEventListener("click", () => setView(button.dataset.view));
}

mobileMenuToggle.addEventListener("click", () => {
	const isOpen = sidebar.classList.toggle("is-open");
	mobileMenuToggle.setAttribute("aria-expanded", String(isOpen));
	sidebarBackdrop.hidden = !isOpen;
});

sidebarBackdrop.addEventListener("click", () => {
	sidebar.classList.remove("is-open");
	mobileMenuToggle.setAttribute("aria-expanded", "false");
	sidebarBackdrop.hidden = true;
});

function updateCount() {
	const count = getWorkingTables().length;
	document.querySelector("#table-count").textContent = `${count} ${count === 1 ? "table" : "tables"}`;
}

function getWorkingTables() {
	return tableDraft ?? tables;
}

function beginTableDraft() {
	if (!tableDraft) tableDraft = tables.map((table) => ({ ...table }));
}

function setTableDraft(nextTables) {
	if (!isAdmin) return;
	tableDraft = nextTables;
	document.querySelector("#request-layout-save").disabled = false;
	storageNote.textContent = "Table layout has unsaved draft changes.";
	renderFloorplan();
}

function openTableInspector(table) {
	selectedTableId = table.id;
	document.querySelector("#inspector-table-name").textContent = table.label;
	document.querySelector("#inspector-capacity").value = table.capacity;
	document.querySelector("#inspector-status").value = table.status;
	rotationInput.value = String(Number(table.rotation) || 0);
	rotationOutput.value = `${rotationInput.value}°`;
	tableInspector.hidden = false;
	for (const tile of tableLayer.querySelectorAll(".floor-table")) {
		tile.classList.toggle("is-selected", tile.dataset.tableId === table.id);
	}
}

function closeTableInspector() {
	tableInspector.hidden = true;
	selectedTableId = null;
	for (const tile of tableLayer.querySelectorAll(".floor-table")) {
		tile.classList.remove("is-selected");
	}
}

function keepInspectorInBounds() {
	if (tableInspector.hidden || !tableInspector.style.left) return;
	const stageRect = document.querySelector(".floorplan-stage").getBoundingClientRect();
	const maxLeft = Math.max(0, stageRect.width - tableInspector.offsetWidth);
	const maxTop = Math.max(0, stageRect.height - tableInspector.offsetHeight);
	const left = Number.parseFloat(tableInspector.style.left) || 0;
	const top = Number.parseFloat(tableInspector.style.top) || 0;
	tableInspector.style.left = `${Math.max(0, Math.min(maxLeft, left))}px`;
	tableInspector.style.top = `${Math.max(0, Math.min(maxTop, top))}px`;
}

window.addEventListener("resize", keepInspectorInBounds);
new ResizeObserver(keepInspectorInBounds).observe(floorplanStage);

function renderFloorplan() {
	const previewBanner = document.querySelector("#layout-preview-banner");
	const workingTables = layoutPreview?.tables ?? getWorkingTables();
	previewBanner.hidden = !layoutPreview;
	document.querySelector("#add-table").hidden = !isAdmin || Boolean(layoutPreview);
	document.querySelector("#request-layout-save").hidden = !isAdmin || Boolean(layoutPreview);
	if (layoutPreview) {
		document.querySelector("#layout-preview-title").textContent = "Proposed layout preview";
		document.querySelector("#layout-preview-detail").textContent = `${layoutPreview.tables.length} tables submitted by ${layoutPreview.requesterName || "Admin"}. This layout is not live.`;
	}
	const selected = workingTables.find((table) => table.id === selectedTableId);
	if (!selected) {
		closeTableInspector();
	} else {
		document.querySelector("#inspector-table-name").textContent = selected.label;
	}

	tableLayer.replaceChildren();
	for (const table of workingTables) {
		const tile = createTextElement("button", `floor-table status-${String(table.status).toLowerCase()}`, table.label);
		tile.type = "button";
		tile.dataset.tableId = table.id;
		tile.style.left = `${table.x}%`;
		tile.style.top = `${table.y}%`;
		tile.style.transform = `translate(-50%, -50%) rotate(${Number(table.rotation) || 0}deg)`;
		tile.setAttribute("aria-label", `${table.label}, capacity ${table.capacity}, ${table.status}, rotated ${Number(table.rotation) || 0} degrees. Select for details or drag to move.`);
		tile.setAttribute("aria-pressed", String(table.id === selectedTableId));
		tile.addEventListener("click", () => {
			if (skipNextClick) {
				skipNextClick = false;
				return;
			}
			openTableInspector(table);
		});
		if (isAdmin && !layoutPreview) {
			tile.addEventListener("pointerdown", (event) => beginTableDrag(event, tile, table));
			tile.addEventListener("pointermove", (event) => moveTableDrag(event, tile));
			tile.addEventListener("pointerup", (event) => endTableDrag(event, tile, table));
			tile.addEventListener("pointercancel", () => cancelTableDrag(tile));
		}
		tableLayer.append(tile);
	}
	updateCount();
	document.querySelector("#table-empty").hidden = workingTables.length > 0;
	document.querySelector("#request-layout-save").disabled = !isAdmin || !tableDraft;
}

document.querySelector("#exit-layout-preview").addEventListener("click", () => {
	layoutPreview = null;
	selectedTableId = null;
	renderFloorplan();
});

let activeDrag = null;
let activeInspectorDrag = null;

function beginInspectorDrag(event) {
	if (event.button !== 0 || event.target.closest("#close-inspector")) return;
	const stageRect = document.querySelector(".floorplan-stage").getBoundingClientRect();
	const inspectorRect = tableInspector.getBoundingClientRect();
	activeInspectorDrag = {
		pointerId: event.pointerId,
		offsetX: event.clientX - inspectorRect.left,
		offsetY: event.clientY - inspectorRect.top,
		stageRect,
	};
	inspectorDragHandle.setPointerCapture(event.pointerId);
	event.preventDefault();
}

function moveInspectorDrag(event) {
	if (!activeInspectorDrag || activeInspectorDrag.pointerId !== event.pointerId) return;
	if (window.matchMedia("(max-width: 680px)").matches) return;
	const { stageRect, offsetX, offsetY } = activeInspectorDrag;
	const maxLeft = Math.max(0, stageRect.width - tableInspector.offsetWidth);
	const maxTop = Math.max(0, stageRect.height - tableInspector.offsetHeight);
	const left = Math.max(0, Math.min(maxLeft, event.clientX - stageRect.left - offsetX));
	const top = Math.max(0, Math.min(maxTop, event.clientY - stageRect.top - offsetY));
	tableInspector.style.left = `${left}px`;
	tableInspector.style.top = `${top}px`;
	tableInspector.style.right = "auto";
	tableInspector.style.bottom = "auto";
}

function endInspectorDrag(event) {
	if (activeInspectorDrag?.pointerId === event.pointerId) activeInspectorDrag = null;
}

inspectorDragHandle.addEventListener("pointerdown", beginInspectorDrag);
inspectorDragHandle.addEventListener("pointermove", moveInspectorDrag);
inspectorDragHandle.addEventListener("pointerup", endInspectorDrag);
inspectorDragHandle.addEventListener("pointercancel", endInspectorDrag);

rotationInput.addEventListener("input", () => {
	rotationOutput.value = `${rotationInput.value}°`;
});

function beginTableDrag(event, tile, table) {
	if (event.button !== 0) return;
	const canvasRect = canvas.getBoundingClientRect();
	const tileRect = tile.getBoundingClientRect();
	activeDrag = {
		pointerId: event.pointerId,
		startX: event.clientX,
		startY: event.clientY,
		pointerOffsetX: event.clientX - (tileRect.left + tileRect.width / 2),
		pointerOffsetY: event.clientY - (tileRect.top + tileRect.height / 2),
		canvasRect,
		table,
		moved: false,
	};
	tile.setPointerCapture(event.pointerId);
	tile.classList.add("is-dragging");
	event.preventDefault();
}

function moveTableDrag(event, tile) {
	if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
	const deltaX = event.clientX - activeDrag.startX;
	const deltaY = event.clientY - activeDrag.startY;
	if (Math.hypot(deltaX, deltaY) > 4) activeDrag.moved = true;
	if (!activeDrag.moved) return;
	const bounds = activeDrag.canvasRect;
	const halfWidth = tile.offsetWidth / 2;
	const halfHeight = tile.offsetHeight / 2;
	const centerX = Math.max(halfWidth, Math.min(bounds.width - halfWidth, event.clientX - bounds.left - activeDrag.pointerOffsetX));
	const centerY = Math.max(halfHeight, Math.min(bounds.height - halfHeight, event.clientY - bounds.top - activeDrag.pointerOffsetY));
	tile.style.left = `${centerX / bounds.width * 100}%`;
	tile.style.top = `${centerY / bounds.height * 100}%`;
}

function endTableDrag(event, tile, table) {
	if (!activeDrag || activeDrag.pointerId !== event.pointerId) return;
	tile.classList.remove("is-dragging");
	if (!activeDrag.moved) {
		activeDrag = null;
		return;
	}
	skipNextClick = true;
	const x = Number.parseFloat(tile.style.left);
	const y = Number.parseFloat(tile.style.top);
	activeDrag = null;
	beginTableDraft();
	setTableDraft(tableDraft.map((item) => item.id === table.id ? { ...item, x, y } : item));
	showMessage(`${table.label} moved in the draft. Request approval to publish the layout.`);
}

function cancelTableDrag(tile) {
	tile.classList.remove("is-dragging");
	activeDrag = null;
	renderFloorplan();
}

function createIconButton(label, text, action, className = "remove-button") {
	const button = createTextElement("button", className, text);
	button.type = "button";
	button.setAttribute("aria-label", label);
	button.addEventListener("click", action);
	return button;
}

function renderFoods() {
	const list = document.querySelector("#food-list");
	const empty = document.querySelector("#food-empty");
	list.replaceChildren();
	for (const food of foods) {
		const row = document.createElement("div");
		row.className = "managed-row food-managed-row";
		const foodId = Number(food.FoodId ?? food.id);
		const foodName = food.FoodName ?? food.name ?? "Unnamed food";
		const foodCategory = food.FoodCategory ?? "Uncategorized";
		const foodDetail = food.FoodDetail ?? food.category ?? "";
		const foodQuantity = Number(food.FoodQuantity ?? 0);
		const foodPrice = Number(food.FoodPrice ?? food.price ?? 0);
		const foodImageUrl = food.FoodImageUrl ?? null;
		// Image thumbnail
		const imgCell = document.createElement("span");
		imgCell.className = "food-img-cell";
		if (foodImageUrl) {
			const img = document.createElement("img");
			img.src = foodImageUrl;
			img.alt = foodName;
			img.className = "food-thumb";
			imgCell.append(img);
		} else {
			const placeholder = document.createElement("span");
			placeholder.className = "food-thumb-placeholder";
			placeholder.textContent = "No photo";
			imgCell.append(placeholder);
		}
		row.append(imgCell);
		row.append(createTextElement("span", "managed-secondary", String(foodId)));
		row.append(createTextElement("span", "managed-name", foodName));
		row.append(createTextElement("span", "managed-secondary", foodCategory));
		row.append(createTextElement("span", "managed-secondary food-detail", foodDetail));
		row.append(createTextElement("span", "managed-secondary", String(foodQuantity)));
		row.append(createTextElement("span", "managed-secondary", `$${foodPrice.toFixed(2)}`));
		if (isAdmin) {
			const remove = createIconButton(`Request removal of ${foodName}`, "Request removal", () => {
				void createFoodRemovalRequest({ FoodId: foodId, FoodName: foodName });
			});
			row.append(remove);
		} else {
			row.append(createTextElement("span", "food-view-only", "View only"));
		}
		list.append(row);
	}
	empty.hidden = foods.length > 0;
	document.querySelector("#food-count").textContent = `${foods.length} ${foods.length === 1 ? "item" : "items"}`;
}

async function createFoodRemovalRequest(food) {
	try {
		await addDoc(restaurantCollection("requests"), {
			type: "food-delete",
			description: `Remove ${food.FoodName} from the food catalog`,
			food,
			createdBy: currentUser.uid,
			requesterUid: currentUser.uid,
			requesterName: currentUserName,
			status: "pending-manager",
			createdAt: serverTimestamp(),
		});
		showMessage(`Removal request for ${food.FoodName} sent to the manager.`);
	} catch {
		showMessage("Food removal request could not be sent. Check your Firestore rules.");
	}
}

function formatRequestDate(request) {
	return request.createdAt?.toDate?.().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) ?? "Just now";
}

function createSelect(options, value, onChange, label) {
	const select = document.createElement("select");
	select.className = "request-status-select";
	select.setAttribute("aria-label", label);
	for (const option of options) {
		const element = document.createElement("option");
		element.value = option.value;
		element.textContent = option.label;
		element.selected = option.value === value;
		select.append(element);
	}
	select.addEventListener("change", () => onChange(select.value));
	return select;
}

function renderRequests() {
	const list = document.querySelector("#request-list");
	const empty = document.querySelector("#request-empty");
	const visibleRequests = [...requests].sort((left, right) => (right.createdAt?.seconds ?? 0) - (left.createdAt?.seconds ?? 0));
	list.replaceChildren();
	for (const request of visibleRequests) {
		const row = document.createElement("article");
		row.className = "request-row";
		const details = document.createElement("div");
		details.className = "request-details";
		const isLayoutRequest = request.type === "table-layout";
		const isFoodRequest = request.type === "food-create" || request.type === "food-delete";
		const isFoodCreate = request.type === "food-create";
		const title = isLayoutRequest
			? "Table layout change"
			: isFoodCreate
				? `Add food: ${request.food?.FoodName ?? "New food"}`
				: request.type === "food-delete"
					? `Remove food: ${request.food?.FoodName ?? "Food item"}`
					: request.description ?? "Request";
		details.append(createTextElement("h2", "request-title", title));
		details.append(createTextElement("p", "request-meta", isLayoutRequest
			? `${request.tables?.length ?? 0} tables · ${request.requesterName ?? "Admin"} · ${formatRequestDate(request)}`
			: isFoodCreate
				? `Food ID ${request.food?.FoodId ?? "?"} · ${request.food?.FoodCategory ?? "Uncategorized"} · Qty ${request.food?.FoodQuantity ?? "?"} · $${Number(request.food?.FoodPrice ?? 0).toFixed(2)} · ${request.requesterName ?? "Admin"} · ${formatRequestDate(request)}`
				: request.type === "food-delete"
					? `Food ID ${request.food?.FoodId ?? "?"} · ${request.requesterName ?? "Admin"} · ${formatRequestDate(request)}`
				: formatRequestDate(request)));
		if (isFoodCreate && request.food?.FoodDetail) {
			details.append(createTextElement("p", "request-food-detail", request.food.FoodDetail));
		}
		if (isFoodCreate && request.food?.FoodImageUrl) {
			const img = document.createElement("img");
			img.src = request.food.FoodImageUrl;
			img.alt = request.food.FoodName ?? "Food photo";
			img.className = "request-food-thumb";
			details.append(img);
		}
		row.append(details);
		const controls = document.createElement("div");
		controls.className = "request-controls";
		if ((isLayoutRequest || isFoodRequest) && request.status === "pending-manager" && isManager) {
			const reviewActions = document.createElement("div");
			reviewActions.className = "request-review-actions";
			if (isLayoutRequest) {
				reviewActions.append(createIconButton("Preview proposed table layout", "Preview", () => {
					layoutPreview = {
						tables: Array.isArray(request.tables) ? request.tables : [],
						requesterName: request.requesterName,
					};
					selectedTableId = null;
					setView("tables");
					renderFloorplan();
				}, "preview-layout"));
			}
			reviewActions.append(createIconButton(`Approve ${title}`, "Approve", () => {
				void reviewManagerRequest(request, "approved");
			}, "approve-layout"));
			reviewActions.append(createIconButton(`Reject ${title}`, "Reject", () => {
				void reviewManagerRequest(request, "rejected");
			}));
			controls.append(reviewActions);
		} else if (isLayoutRequest || isFoodRequest) {
			controls.append(createTextElement("span", `request-pending-badge status-${request.status}`, request.status === "pending-manager" ? "Awaiting manager" : request.status));
		} else if (isManager) {
			controls.append(createTextElement("span", "request-pending-badge", request.status ?? "open"));
		} else {
			controls.append(createSelect(
				[{ value: "open", label: "Open" }, { value: "in-progress", label: "In progress" }, { value: "done", label: "Done" }],
				request.status,
				(status) => updateRequest(request.id, { status }),
				`Status for ${request.description}`,
			));
		}
		if (isAdmin) {
			controls.append(createIconButton(`Delete request: ${request.description ?? "table layout"}`, "Delete", () => deleteRequest(request.id), "request-delete-button"));
		}
		row.append(controls);
		list.append(row);
	}
	empty.hidden = visibleRequests.length > 0;
	const openCount = requests.filter((request) => ["table-layout", "food-create", "food-delete"].includes(request.type)
		? request.status === "pending-manager"
		: request.status !== "done").length;
	document.querySelector("#request-count").textContent = `${openCount} open`;
}

async function reviewManagerRequest(request, decision) {
	const batch = writeBatch(db);
	if (decision === "approved") {
		if (request.type === "table-layout") {
			const requestedTables = Array.isArray(request.tables) ? request.tables : [];
			const requestedIds = new Set(requestedTables.map((table) => table.id));
			for (const existingTable of tables) {
				if (!requestedIds.has(existingTable.id)) batch.delete(restaurantDocument("tables", existingTable.id));
			}
			for (const table of requestedTables) {
				const { id, ...tableData } = table;
				batch.set(restaurantDocument("tables", id), {
					...tableData,
					updatedBy: currentUser.uid,
					updatedAt: serverTimestamp(),
				});
			}
		} else if (request.type === "food-create") {
			const food = request.food;
			const foodId = Number(food?.FoodId);
			if (foods.some((item) => Number(item.FoodId ?? item.id) === foodId)) {
				showMessage(`Food ID ${foodId} already exists. Reject this request or remove the existing item first.`);
				return;
			}
			batch.set(restaurantDocument("foods", String(foodId)), {
				...food,
				createdBy: request.requesterUid,
				createdAt: serverTimestamp(),
				approvedBy: currentUser.uid,
				updatedAt: serverTimestamp(),
			});
		} else if (request.type === "food-delete") {
			const foodId = Number(request.food?.FoodId);
			if (!foods.some((item) => Number(item.FoodId ?? item.id) === foodId)) {
				showMessage(`Food ID ${foodId} is no longer in the live catalog.`);
				return;
			}
			batch.delete(restaurantDocument("foods", String(foodId)));
		}
	}
	batch.update(restaurantDocument("requests", request.id), {
		status: decision,
		reviewedBy: currentUser.uid,
		reviewedAt: serverTimestamp(),
	});
	try {
		await batch.commit();
		showMessage(decision === "approved" ? "Request approved and published." : "Request rejected.");
	} catch {
		showMessage("Could not review this request. Check your manager role and Firestore rules.");
	}
}

async function updateRequest(requestId, changes) {
	try {
		await updateDoc(restaurantDocument("requests", requestId), { ...changes, updatedAt: serverTimestamp() });
		showMessage("Request updated in Firebase.");
	} catch {
		showMessage("The request could not be updated. Check your Firestore rules.");
	}
}

async function deleteRequest(requestId) {
	try {
		await deleteDoc(restaurantDocument("requests", requestId));
		showMessage("Request deleted from Firebase.");
	} catch {
		showMessage("The request could not be deleted. Check your Firestore rules.");
	}
}

function renderAll() {
	renderFloorplan();
	renderFoods();
	renderRequests();
}

function setWorkspaceRole(role) {
	isAdmin = role === "admin";
	isManager = role === "manager";
	document.querySelector("#account-role").textContent = isAdmin ? "Administrator" : isManager ? "Manager" : "Access not configured";
	storageNote.textContent = isAdmin
		? "Table edits need manager approval before publishing."
		: isManager
			? "Review pending table layouts in Requests."
			: "This account is not configured for the workspace.";
	for (const control of document.querySelectorAll("#add-table, #request-layout-save, #inspector-capacity, #inspector-status, #inspector-rotation, #save-table, #delete-table, #food-form input, #food-form select, #food-form button, #show-category-form, #category-form input, #category-form button, #request-form input, #request-form button")) {
		control.disabled = !isAdmin;
	}
	requestForm.hidden = !isAdmin;
	for (const button of navButtons) button.hidden = false;
	document.querySelector("#tables-title").textContent = "Table management";
	document.querySelector("#tables-description").textContent = isManager
		? "View the current published floor plan and preview changes submitted by the admin."
		: "Arrange tables, then request manager approval to publish the finished layout.";
	document.querySelector("#food-description").textContent = isManager
		? "View the current menu catalog managed by the admin."
		: "Add menu items and keep prices up to date.";
	document.querySelector("#food-form").hidden = !isAdmin;
	categoryForm.hidden = true;
	document.querySelector("#food-empty").textContent = isManager
		? "No approved food items are in the catalog yet."
		: "No food items yet. Add a food proposal above.";
	for (const heading of document.querySelectorAll(".food-list-heading .visually-hidden")) {
		heading.textContent = isAdmin ? "ACTIONS" : "ACCESS";
	}
	if (isManager) {
		document.querySelector("#requests-kicker").textContent = "MANAGER INBOX";
		document.querySelector("#requests-title").textContent = "Manager approvals";
		document.querySelector("#requests-description").textContent = "Review admin table layouts and food catalog changes before publishing.";
	} else {
		document.querySelector("#requests-kicker").textContent = "ADMIN WORKSPACE";
		document.querySelector("#requests-title").textContent = "Requests";
		document.querySelector("#requests-description").textContent = "Track saved requests and table layouts awaiting manager review.";
	}
	if (isManager) setView("requests");
	if (!isAdmin && !isManager) {
		showMessage("Set role: admin or manager on this user's Firestore profile to enable the workspace.");
	}
}

function seedStarterDraft() {
	if (!isAdmin || seedAttempted || tables.length > 0 || tableDraft) return;
	seedAttempted = true;
	tableDraft = starterTables.map((table) => ({
		...table,
		id: doc(restaurantCollection("tables")).id,
		capacity: 4,
		status: "Available",
		rotation: 0,
	}));
	document.querySelector("#request-layout-save").disabled = false;
	storageNote.textContent = "Starter layout is a draft until a manager approves it.";
		showMessage("Starter floor plan is a draft. Request manager approval to publish it.");
	renderFloorplan();
}

function listenForWorkspace() {
	for (const unsubscribe of unsubscribeData) unsubscribe();
	unsubscribeData = [onSnapshot(restaurantCollection("tables"), (snapshot) => {
			tables = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
			if (!tableDraft) renderFloorplan();
			seedStarterDraft();
		}, () => showMessage("Tables could not be loaded. Check your Firestore rules."))];

	unsubscribeData.push(onSnapshot(restaurantCollection("foods"), (snapshot) => {
		foods = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
		renderFoods();
		void seedDefaultFoods();
	}, () => showMessage("Food items could not be loaded. Check your Firestore rules.")));
	unsubscribeData.push(onSnapshot(restaurantCollection("foodCategories"), (snapshot) => {
		foodCategories = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
			.filter((item) => typeof item.name === "string")
			.sort((left, right) => left.name.localeCompare(right.name));
		renderFoodCategories();
		void seedDefaultFoodCategories();
	}, () => showMessage("Food categories could not be loaded. Check your Firestore rules.")));

	unsubscribeData.push(onSnapshot(restaurantCollection("requests"), (snapshot) => {
		requests = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
		renderFloorplan();
		renderRequests();
	}, () => showMessage("Requests could not be loaded. Check your Firestore rules.")));
}

function showMessage(text) {
	message.textContent = text;
}

document.querySelector("#add-table").addEventListener("click", () => {
	if (!isAdmin) return;
	beginTableDraft();
	const labels = new Set(tableDraft.map((table) => table.label));
	let index = 1;
	while (labels.has(`T${String(index).padStart(2, "0")}`)) index += 1;
	const label = `T${String(index).padStart(2, "0")}`;
	const positionIndex = tableDraft.length;
	const xPositions = [52, 70, 88];
	const yPositions = [46, 60, 74, 86];
	const table = {
		id: doc(restaurantCollection("tables")).id,
		label,
		capacity: 4,
		x: xPositions[positionIndex % xPositions.length],
		y: yPositions[Math.floor(positionIndex / xPositions.length) % yPositions.length],
		status: "Available",
		rotation: 0,
	};
	setTableDraft([...tableDraft, table]);
	showMessage(`${label} added to the draft. Request manager approval to publish it.`);
});

document.querySelector("#request-layout-save").addEventListener("click", async () => {
	if (!isAdmin || !tableDraft) return;
	const button = document.querySelector("#request-layout-save");
	button.disabled = true;
	try {
		await addDoc(restaurantCollection("requests"), {
			type: "table-layout",
			description: "Publish the requested restaurant table layout",
			tables: tableDraft.map(({ id, label, capacity, x, y, status, rotation }) => ({
				id,
				label,
				capacity,
				x,
				y,
				status,
				rotation: rotation ?? 0,
			})),
			createdBy: currentUser.uid,
			requesterUid: currentUser.uid,
			requesterName: currentUserName,
			status: "pending-manager",
			createdAt: serverTimestamp(),
		});
		tableDraft = null;
		selectedTableId = null;
		storageNote.textContent = "Layout request sent; live tables are unchanged until manager approval.";
		renderFloorplan();
		showMessage("Layout request sent. The live layout is unchanged until a manager approves it.");
	} catch {
		button.disabled = false;
		showMessage("Layout request could not be sent. Check your connection and Firestore rules.");
	}
});

document.querySelector("#close-inspector").addEventListener("click", closeTableInspector);

document.querySelector("#save-table").addEventListener("click", () => {
	const table = getWorkingTables().find((item) => item.id === selectedTableId);
	if (!table) return;
	const capacity = Number(document.querySelector("#inspector-capacity").value);
	const status = document.querySelector("#inspector-status").value;
	const rotation = Number(rotationInput.value);
	if (!Number.isInteger(capacity) || capacity < 1 || capacity > 30) {
		showMessage("Table capacity must be from 1 to 30 seats.");
		return;
	}
	beginTableDraft();
	setTableDraft(tableDraft.map((item) => item.id === table.id ? { ...item, capacity, status, rotation } : item));
	showMessage(`${table.label} changes are in the draft. Request manager approval to publish.`);
	closeTableInspector();
});

document.querySelector("#delete-table").addEventListener("click", () => {
	const table = getWorkingTables().find((item) => item.id === selectedTableId);
	if (!table) return;
	beginTableDraft();
	setTableDraft(tableDraft.filter((item) => item.id !== table.id));
	showMessage(`${table.label} removal is in the draft. Request manager approval to publish.`);
	closeTableInspector();
});

document.querySelector("#show-category-form").addEventListener("click", () => {
	categoryForm.hidden = !categoryForm.hidden;
	if (!categoryForm.hidden) categoryForm.elements.categoryName.focus();
});

categoryForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	const input = categoryForm.elements.categoryName;
	const name = input.value.trim();
	if (!name) return;
	if (foodCategories.some((category) => category.name.toLowerCase() === name.toLowerCase())) {
		showMessage(`Category ${name} already exists.`);
		return;
	}
	const submitButton = categoryForm.querySelector('button[type="submit"]');
	submitButton.disabled = true;
	try {
		await addDoc(restaurantCollection("foodCategories"), {
			name,
			createdBy: currentUser.uid,
			createdAt: serverTimestamp(),
		});
		categoryForm.reset();
		categoryForm.hidden = true;
		foodCategorySelect.value = name;
		showMessage(`Category ${name} added.`);
	} catch {
		showMessage("Category could not be added. Check your Firestore rules.");
	} finally {
		submitButton.disabled = false;
	}
});

document.querySelector("#food-form").addEventListener("submit", async (event) => {
	event.preventDefault();
	const form = event.currentTarget;
	const food = {
		FoodId: Number(form.elements.FoodId.value),
		FoodName: form.elements.FoodName.value.trim(),
		FoodDetail: form.elements.FoodDetail.value.trim(),
		FoodQuantity: Number(form.elements.FoodQuantity.value),
		FoodPrice: Number(form.elements.FoodPrice.value),
		FoodCategory: form.elements.FoodCategory.value,
	};
	if (!Number.isInteger(food.FoodId) || food.FoodId < 1
		|| !Number.isInteger(food.FoodQuantity) || food.FoodQuantity < 0
		|| !Number.isFinite(food.FoodPrice) || food.FoodPrice < 0
		|| !food.FoodName || !food.FoodDetail || !food.FoodCategory) {
		showMessage("Enter all food details, choose a category, use whole numbers for ID and quantity, and a non-negative price.");
		return;
	}
	const idExists = foods.some((item) => Number(item.FoodId ?? item.id) === food.FoodId)
		|| requests.some((request) => request.type === "food-create"
			&& request.status === "pending-manager"
			&& Number(request.food?.FoodId) === food.FoodId);
	if (idExists) {
		showMessage(`Food ID ${food.FoodId} is already in use or awaiting review.`);
		return;
	}
	const submitButton = form.querySelector('button[type="submit"]');
	submitButton.disabled = true;
	showMessage("Saving…");
	// Compress image to base64 if one was selected
	const imageFile = form.elements.FoodImage?.files?.[0];
	if (imageFile) {
		try {
			food.FoodImageUrl = await compressImage(imageFile);
		} catch {
			showMessage("Image could not be processed. The food request was not sent.");
			submitButton.disabled = false;
			return;
		}
	}
	try {
		await addDoc(restaurantCollection("requests"), {
			type: "food-create",
			description: `Add ${food.FoodName} (${food.FoodCategory}) to the food catalog`,
			food,
			createdBy: currentUser.uid,
			requesterUid: currentUser.uid,
			requesterName: currentUserName,
			status: "pending-manager",
			createdAt: serverTimestamp(),
		});
		form.reset();
		showMessage(`${food.FoodName} was sent to the manager for approval.`);
	} catch {
		showMessage("Food request could not be sent. Check your connection and Firestore rules.");
	} finally {
		submitButton.disabled = false;
	}
});

requestForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	const description = requestForm.elements.description.value.trim();
	if (!description) return;
	const submitButton = requestForm.querySelector('button[type="submit"]');
	submitButton.disabled = true;
	try {
		await addDoc(restaurantCollection("requests"), {
			description,
			status: "open",
			createdBy: currentUser.uid,
			createdAt: serverTimestamp(),
		});
		requestForm.reset();
		showMessage("Request saved to Firebase.");
	} catch {
		showMessage("Request could not be saved. Check your connection and Firestore rules.");
	} finally {
		submitButton.disabled = false;
	}
});

onAuthStateChanged(auth, async (user) => {
	if (!user) {
		window.location.replace("index.html");
		return;
	}

	currentUser = user;
	currentUserName = user.email?.split("@")[0] ?? "Administrator";
	accountName.textContent = currentUserName;
	accountAvatar.textContent = currentUserName.charAt(0).toUpperCase();
	document.querySelector("#session-email").textContent = user.email ?? "your account";
	document.querySelector("#session-time").textContent = new Date().toLocaleString(undefined, {
		dateStyle: "medium",
		timeStyle: "short",
	});

	try {
		const profile = await getDoc(doc(db, "users", user.uid));
		const profileData = profile.exists() ? profile.data() : {};
		const username = profileData.username;
		if (typeof username === "string" && username.trim()) currentUserName = username.trim();
		accountName.textContent = currentUserName;
		accountAvatar.textContent = currentUserName.charAt(0).toUpperCase();
		setWorkspaceRole(profileData.role);
		if (isAdmin || isManager) listenForWorkspace();
	} catch {
		setWorkspaceRole(null);
		storageNote.textContent = "Could not read account permissions.";
		showMessage("Your administrator profile could not be loaded.");
	}
});

signOutButton.addEventListener("click", async () => {
	signOutButton.disabled = true;
	try {
		await signOut(auth);
		window.location.replace("index.html");
	} catch {
		message.textContent = "Unable to sign out. Please try again.";
		signOutButton.disabled = false;
	}
});