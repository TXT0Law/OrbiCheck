# URL Groups

Organize URLs into groups for batch scanning.

## GET /url-groups

List groups with pagination.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `skip` | int | 0 | Offset |
| `limit` | int | 50 | Results per page (1–100) |

> **Note:** URL Groups use `skip`/`limit` pagination. Other resources (e.g. Scans) use `offset`/`limit`. This is a deliberate design choice reflecting each resource's access patterns.

**Response:** `SuccessResponse[UrlGroupListResponse]`

---

## POST /url-groups

Create a new URL group.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Group name |
| `description` | string | No | Group description |

**Response:** `201 SuccessResponse[UrlGroupResponse]`

---

## GET /url-groups/{group_id}

Get group detail including members and their scan status.

**Response:** `SuccessResponse[UrlGroupDetailResponse]`

---

## PUT /url-groups/{group_id}

Update group name and/or description.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | New name |
| `description` | string | No | New description |

**Response:** `SuccessResponse[UrlGroupResponse]`

---

## DELETE /url-groups/{group_id}

Delete group and all its members.

**Response:** `SuccessResponse`

---

## GET /url-groups/{group_id}/members

List group members with scan status.

**Response:** `SuccessResponse` with `members` array.

---

## POST /url-groups/{group_id}/members

Add a URL to the group.

**Request body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `url` | string | Yes | URL to add |

**Response:** `201 SuccessResponse[UrlGroupMemberResponse]`

---

## DELETE /url-groups/{group_id}/members/{member_id}

Remove a member from the group.

**Response:** `SuccessResponse`
