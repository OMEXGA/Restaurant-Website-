# Firestore workspace setup

The dashboard stores restaurant data in these collections:

- `restaurants/main/tables/{tableId}`
- `restaurants/main/foods/{foodId}`
- `restaurants/main/foodCategories/{categoryId}`
- `restaurants/main/requests/{requestId}`

Food records use the admin-entered fields `FoodId` (integer), `FoodName` (string), `FoodDetail` (string), `FoodQuantity` (integer), and `FoodPrice` (number). `FoodId` is also used as the Firestore document ID. Additions and removals become pending requests and do not change the live catalog until a manager approves them.

Table management uses a draft. Admin changes to table position, capacity, status, rotation, additions, and deletions are not written to the live table collection as they are made. **Request to save** submits the complete proposed layout as a `table-layout` request with `status: "pending-manager"`. A manager approves or rejects it in Requests. Approval publishes the complete layout; rejection leaves the existing live layout unchanged.

## Enable the admin account

In **Firestore Database → Data**, open `users/{admin-auth-uid}` and add a string field:

```text
role: admin
```

Use the UID shown in **Authentication → Users** as the document ID. Set this role manually in the Firebase Console; the app prevents users from assigning or changing their own role. Signed-in accounts without this field cannot access restaurant data.

## Enable the manager account

In **Firestore Database → Data**, open or create `users/{manager-auth-uid}` and add a string field:

```text
role: manager
```

Use the manager's UID from **Authentication → Users** as the document ID. Managers can view the live table plan and food catalog, preview submitted table layouts, and approve or reject table and food requests. Managers cannot edit the admin's drafts or change live data directly.

## Publish the security rules

In Firebase Console, open **Firestore Database → Rules**, replace the rules with the contents of `firestore.rules`, then click **Publish**. Admins can read live tables and submit proposals; only managers can write the published table collection or approve/reject a layout request. User roles must be assigned manually in the Firebase Console; users cannot change their own role through the app.

If there are no live tables, the starter layout is created as an admin draft, not saved to Firestore. Table additions, moves, edits, and removals remain draft-only until **Request to save** is submitted and a manager approves it. Food additions and removals are also stored as pending requests until manager approval; ordinary admin requests continue to save directly to Firebase.