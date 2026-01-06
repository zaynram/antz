/**
 * Google Drive API integration for storing images and files
 * Uses the Drive v3 REST API with OAuth2 tokens from Firebase Auth
 */

import { auth } from "./firebase"

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3"
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3"

// Simple folder structure since this account is dedicated to the app
const APP_FOLDER = "app"
const IMG_FOLDER = "img"

/**
 * Get the OAuth2 access token from the current user
 */
async function getAccessToken(): Promise<string> {
    const user = auth.currentUser
    if (!user) {
        throw new Error("User not authenticated")
    }

    // The OAuth access token is stored in sessionStorage during sign-in
    // This is necessary for Google Drive API access (different from Firebase ID token)
    const storedToken = sessionStorage.getItem("google_access_token")
    if (!storedToken) {
        throw new Error("Google access token not found. Please sign in again.")
    }

    return storedToken
}

/**
 * Find or create a folder in Google Drive (searches in root or parent)
 */
async function ensureFolder(folderName: string, parentId?: string): Promise<string> {
    const token = await getAccessToken()

    // Build search query
    const parentQuery = parentId ? `'${parentId}' in parents` : "'root' in parents"
    const searchQuery = `name='${folderName}' and ${parentQuery} and mimeType='application/vnd.google-apps.folder' and trashed=false`

    // Search for existing folder
    const searchResponse = await fetch(
        `${DRIVE_API_BASE}/files?` +
            new URLSearchParams({
                q: searchQuery,
                fields: "files(id, name)",
                spaces: "drive",
            }),
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    )

    if (!searchResponse.ok) {
        throw new Error(`Failed to search for folder: ${searchResponse.statusText}`)
    }

    const searchData = await searchResponse.json()

    if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id
    }

    // Create folder if it doesn't exist
    const createBody: any = {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
    }

    if (parentId) {
        createBody.parents = [parentId]
    }

    const createResponse = await fetch(`${DRIVE_API_BASE}/files`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify(createBody),
    })

    if (!createResponse.ok) {
        throw new Error(`Failed to create folder: ${createResponse.statusText}`)
    }

    const createData = await createResponse.json()
    return createData.id
}

/**
 * Upload a file to Google Drive with simple path structure
 * Example: ['img'] + 'z_pfp.jpg' → app/img/z_pfp.jpg
 */
export async function uploadFileToDrive(
    file: File,
    folderPath: string[],
    filename?: string
): Promise<{ id: string; webContentLink: string; webViewLink: string }> {
    const token = await getAccessToken()

    // Ensure app folder exists
    const appFolderId = await ensureFolder(APP_FOLDER)

    // Navigate/create folder structure
    let currentFolderId = appFolderId
    for (const folderName of folderPath) {
        currentFolderId = await ensureFolder(folderName, currentFolderId)
    }

    const existingFileName = filename || file.name

    // Delete existing file with same name if it exists
    await deleteFileByName(currentFolderId, existingFileName)

    // Upload the file using multipart upload
    const metadata = {
        name: existingFileName,
        parents: [currentFolderId],
    }

    const formData = new FormData()
    formData.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }))
    formData.append("file", file)

    const uploadResponse = await fetch(
        `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,webContentLink,webViewLink`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
            },
            body: formData,
        }
    )

    if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text()
        throw new Error(`Failed to upload file: ${uploadResponse.statusText} - ${errorText}`)
    }

    const uploadData = await uploadResponse.json()

    // Make the file publicly accessible (anyone with link can view)
    const publicSuccess = await makeFilePublic(uploadData.id)

    if (!publicSuccess) {
        console.warn("File uploaded but may not be publicly accessible")
    }

    // For iOS compatibility, use the direct drive.google.com URL format
    // This format is more reliable than thumbnailLink for cross-origin loading
    // Add a timestamp to prevent iOS caching issues
    // Add file extension hint for GIF detection in getIOSCompatibleImageUrl
    const timestamp = Date.now()
    const extension = existingFileName.split('.').pop()?.toLowerCase() || ''
    const publicUrl = `https://drive.google.com/thumbnail?id=${uploadData.id}&sz=w400&timestamp=${timestamp}&ext=${extension}`

    return {
        id: uploadData.id,
        webContentLink: publicUrl,
        webViewLink: uploadData.webViewLink,
    }
}

/**
 * Get file details including thumbnail link
 * Note: Not currently used as we switched to direct thumbnail URLs for iOS compatibility
 */
/*
async function getFileDetails(fileId: string): Promise<{ thumbnailLink?: string }> {
    const token = await getAccessToken()

    const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}?fields=thumbnailLink`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    })

    if (!response.ok) {
        console.warn("Failed to get file details")
        return {}
    }

    return await response.json()
}
*/

/**
 * Make a file publicly accessible (anyone with link can view)
 */
async function makeFilePublic(fileId: string): Promise<boolean> {
    const token = await getAccessToken()

    const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}/permissions`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            role: "reader",
            type: "anyone",
        }),
    })

    if (!response.ok) {
        console.error("Failed to make file public:", response.statusText, await response.text())
        return false
    }

    return true
}

/**
 * Delete a file by name within a specific folder
 */
async function deleteFileByName(folderId: string, filename: string): Promise<void> {
    const token = await getAccessToken()

    // Search for the file
    const fileSearchResponse = await fetch(
        `${DRIVE_API_BASE}/files?` +
            new URLSearchParams({
                q: `name='${filename}' and '${folderId}' in parents and trashed=false`,
                fields: "files(id)",
                spaces: "drive",
            }),
        {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    )

    if (!fileSearchResponse.ok) {
        return // File doesn't exist
    }

    const fileData = await fileSearchResponse.json()
    if (!fileData.files || fileData.files.length === 0) {
        return // File doesn't exist
    }

    // Delete the file
    const fileId = fileData.files[0].id
    const deleteResponse = await fetch(`${DRIVE_API_BASE}/files/${fileId}`, {
        method: "DELETE",
        headers: {
            Authorization: `Bearer ${token}`,
        },
    })

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
        console.warn("Failed to delete file:", deleteResponse.statusText)
    }
}

/**
 * Delete a file from Google Drive by path and filename (legacy support)
 */
export async function deleteFileFromDrive(folderPath: string[], filename: string): Promise<void> {
    const token = await getAccessToken()

    try {
        // Ensure app folder exists
        const appFolderId = await ensureFolder(APP_FOLDER)
        let currentFolderId = appFolderId

        // Navigate to the target folder
        for (const folderName of folderPath) {
            const searchResponse = await fetch(
                `${DRIVE_API_BASE}/files?` +
                    new URLSearchParams({
                        q: `name='${folderName}' and '${currentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                        fields: "files(id)",
                        spaces: "drive",
                    }),
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            )

            if (!searchResponse.ok) {
                return // Folder doesn't exist, nothing to delete
            }

            const searchData = await searchResponse.json()
            if (!searchData.files || searchData.files.length === 0) {
                return // Folder doesn't exist, nothing to delete
            }

            currentFolderId = searchData.files[0].id
        }

        // Delete file by name
        await deleteFileByName(currentFolderId, filename)
    } catch (e) {
        console.warn("Failed to delete file:", e)
    }
}

/**
 * Get file extension from MIME type
 */
function getExtensionFromMimeType(mimeType: string): string {
    const mimeMap: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
    }
    return mimeMap[mimeType] || 'jpg'
}

/**
 * Upload a profile picture for a user
 * Stores as: app/img/z_pfp.{ext} or app/img/t_pfp.{ext}
 * Supports jpg, png, gif, and webp formats
 */
export async function uploadProfilePicture(userId: string, file: File): Promise<string> {
    const extension = getExtensionFromMimeType(file.type)
    const filename = `${userId.toLowerCase()}_pfp.${extension}`
    const result = await uploadFileToDrive(file, [IMG_FOLDER], filename)
    return result.webContentLink
}

/**
 * Delete a user's profile picture
 * Tries all possible extensions since we don't know which one was used
 */
export async function deleteProfilePicture(userId: string): Promise<void> {
    const extensions = ['jpg', 'png', 'gif', 'webp', 'jpeg']
    const userPrefix = userId.toLowerCase()
    
    // Try to delete all possible profile picture files for this user
    for (const ext of extensions) {
        const filename = `${userPrefix}_pfp.${ext}`
        try {
            await deleteFileFromDrive([IMG_FOLDER], filename)
        } catch (e) {
            // Continue trying other extensions
            console.debug(`No ${ext} profile picture found for ${userId}`)
        }
    }
}

/**
 * Store the Google access token in session storage
 * Call this after successful Google sign-in
 */
export function storeGoogleAccessToken(accessToken: string): void {
    sessionStorage.setItem("google_access_token", accessToken)
}

/**
 * Clear the stored Google access token
 * Call this on sign out
 */
export function clearGoogleAccessToken(): void {
    sessionStorage.removeItem("google_access_token")
}
