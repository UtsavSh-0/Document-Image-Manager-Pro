# 📄 Document Image Manager Pro

A professional web-based image and document processing software designed for **CCC, O Level, MSME, Scholarship, Admission, CSC Centers, Cyber Cafés, and Computer Institutes**.

The software automatically converts, resizes, compresses, validates, organizes, and exports photos and documents according to government form requirements.

---

## ✨ Features

### 📥 Multiple Upload Methods

* File Upload
* Drag & Drop
* Copy-Paste (Ctrl + V)
* Camera Capture
* Bulk Upload

### 🖼 Supported Formats

* JPG
* JPEG
* PNG
* WEBP
* PDF (Preview Support)

---

## 🔄 Automatic Image Processing

### Format Conversion

Automatically converts:

* JPEG → JPG
* PNG → JPG
* WEBP → JPG

### Image Optimization

* Auto Compression
* Smart Resizing
* DPI Validation
* File Size Validation
* Quality Preservation
* White Background Optimization

---

## 🎯 Built-in Presets

### CCC / O Level

#### Photo

| Property   | Requirement  |
| ---------- | ------------ |
| Format     | JPG/JPEG     |
| File Size  | 5 KB – 50 KB |
| Dimensions | 132 × 170 px |
| DPI        | 96 – 300     |

#### Signature

| Property   | Requirement  |
| ---------- | ------------ |
| Format     | JPG/JPEG     |
| File Size  | 5 KB – 20 KB |
| Dimensions | 170 × 132 px |
| DPI        | 96 – 200     |

#### Left Thumb Impression

| Property   | Requirement  |
| ---------- | ------------ |
| Format     | JPG/JPEG     |
| File Size  | 5 KB – 20 KB |
| Dimensions | 170 × 132 px |
| DPI        | 96 – 200     |

---

### MSME

#### Passport Photo

* Maximum 20 KB

#### Signature

* Maximum 20 KB

#### Fingerprint

* Maximum 20 KB

#### Income Certificate

* Maximum 300 KB

#### Caste Certificate

* Maximum 300 KB

#### Residence Certificate

* Maximum 300 KB

#### Bank Passbook

* Maximum 300 KB

#### Other Documents

* Maximum 300 KB

---

## 🛠 Manual Editing Tools

* Resize Width
* Resize Height
* Crop
* Rotate
* Zoom
* Brightness Control
* Contrast Control
* Sharpness Adjustment
* Background Removal
* White Background Conversion

---

## 📝 Rename Files

Rename files before export.

Examples:

```text
Photo.jpg
Signature.jpg
Thumb.jpg
Income_Certificate.jpg
Passbook.jpg
```

Bulk Rename Supported:

```text
UTSAV_Photo.jpg
UTSAV_Signature.jpg
UTSAV_Thumb.jpg
```

---

## 📂 Applicant Folder Management

Create and manage folders for every applicant.

Example:

```text
UTSAV_SHARMA/
│
├── Photo.jpg
├── Signature.jpg
├── Thumb.jpg
├── Income_Certificate.jpg
├── Caste_Certificate.jpg
├── Passbook.jpg
```

---

## 📦 Export Options

* Export Single File
* Export Multiple Files
* Export ZIP Folder
* Export Applicant Folder

Example:

```text
UTSAV_SHARMA.zip
```

---

## ✅ Live Validation

Real-time validation for:

* Width
* Height
* DPI
* Format
* File Size

Example:

```text
✅ Width Correct
✅ Height Correct
✅ JPG Format
✅ File Size Valid
```

or

```text
❌ Wrong Dimensions
❌ File Too Large
❌ Unsupported Format
```

---

## 👀 Preview Panel

Displays:

### Original Image

* Width
* Height
* Format
* File Size

### Processed Image

* Width
* Height
* Format
* File Size
* DPI

---

## 🔍 Search & History

Search records using:

* Applicant Name
* Mobile Number
* Date

Features:

* Recent Files
* Recent Folders
* Processing History

---

## 🤖 Auto Detect Document Type

Automatically identifies:

* Passport Photo
* Signature
* Thumb Impression
* Bank Passbook
* Income Certificate
* Caste Certificate
* Residence Certificate

and applies the correct preset automatically.

---

## 🚀 Performance

* Browser-Based Processing
* No Mandatory Server Upload
* Works Offline
* Batch Processing Support
* Supports 500+ Files
* Optimized for Low-End PCs
* Fast Compression Engine

---

## 🏗 Tech Stack

### Frontend

* Next.js 15
* TypeScript
* Tailwind CSS
* ShadCN UI

### Image Processing

* Sharp
* Canvas API
* Compressor.js

### File Handling

* JSZip
* IndexedDB

---

## 🎨 User Interface

Modules:

1. Dashboard
2. CCC / O Level Processor
3. MSME Processor
4. Custom Processor
5. File Manager
6. Export Center
7. Settings

---

## 💡 Future Roadmap

* OCR Text Extraction
* Aadhaar Card Support
* PAN Card Support
* Scholarship Form Presets
* AI Background Detection
* Auto Face Centering
* Cloud Backup
* Multi-User Login
* Institution Management Panel

---

## 📜 License

This project is intended for educational institutions, cyber cafés, CSC centers, computer institutes, and government form processing workflows.

