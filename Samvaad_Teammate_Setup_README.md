# Samvaad (ISL Connect) --- Teammate Setup Guide

This guide explains how to pull the latest code, run the Samvaad web
app, start the ISL recognition service, and load the Chrome extension on
Windows.

> **Important:** Each teammate must install dependencies on their own
> machine. Do not copy another person's `venv`, `node_modules`,
> `.env.local`, model checkpoints, or private credentials.

## 1. Prerequisites

Install: - Git - Node.js (LTS) and npm - Python 3.12.10 for the ISL
recognition service - Google Chrome - Webcam and microphone (for
features that use them)

Check in PowerShell:

``` powershell
git --version
node --version
npm --version
python --version
```

If Python 3.12 is installed via the Python launcher:

``` powershell
py -3.12 --version
```

## 2. Get the latest code

For a new checkout:

``` powershell
git clone https://github.com/Hriday-Aneja/ISL.git
cd ISL
```

If you already cloned the repository, open PowerShell in the repository
folder and run:

``` powershell
git switch main
git pull --ff-only origin main
```

If Git reports local changes, back them up or commit them first. Do not
blindly reset or delete local work.

## 3. Run the web app

The React/Vite web app is located at:

``` text
isl-comp-updated/isl-comp
```

From the repository root:

``` powershell
cd isl-comp-updated/isl-comp
npm install
npm run dev
```

Open the local URL printed by Vite in the terminal (usually
`http://localhost:5173`). Keep this terminal running.

### Environment variables

If the web app requires local settings, create `.env.local` next to the
web app's `package.json`, using the values agreed by the team. A typical
local configuration used by Samvaad is:

``` env
VITE_RECOGNITION_SERVICE_URL=ws://127.0.0.1:8765
VITE_SIGNALING_SERVER_URL=http://localhost:4000
```

Only add these if the corresponding services are configured in your
checkout. Do not commit `.env.local` or put API keys/secrets in it. The
signaling URL is useful only when the signaling server is running.

## 4. Start the ISL recognition service

The ML code is in:

``` text
isl-connect/include-ml
```

From the repository root:

``` powershell
cd isl-connect/include-ml
py -3.12 -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
```

Create the virtual environment only once. Install the project's
dependencies. If this folder contains `requirements.txt`, run:

``` powershell
pip install -r requirements.txt
```

The current recognition code is associated with these compatible
versions:

``` powershell
pip install mediapipe==0.10.14 transformers==4.44.2
```

Do not upgrade Transformers to 5.x for this setup unless the model code
has been updated and tested for it. Install any other required packages
using the versions agreed by the team.

### Model checkpoint

The recognition service expects a trained checkpoint configured in the
code, currently associated with:

``` text
models/custom_scratch/custom_best.pth
```

Model weights may not be included in Git because of their size. If the
checkpoint is missing, ask the project owner/team for the approved model
file or shared download location. Do not substitute a random checkpoint.

### Start the service

From `isl-connect/include-ml`, with the virtual environment activated:

``` powershell
python recognition_service.py
```

Keep the terminal open. The service is expected to listen locally at:

``` text
ws://127.0.0.1:8765
```

If the script reports a missing dependency or checkpoint, resolve that
error before testing recognition.

## 5. Load the Chrome extension

The extension source folder is:

``` text
chrome-extension
```

1.  Open Google Chrome.
2.  Visit `chrome://extensions`.
3.  Turn **Developer mode** on.
4.  Click **Load unpacked**.
5.  Select the repository's `chrome-extension` folder --- the folder
    that contains `manifest.json`.
6.  Optionally pin Samvaad from Chrome's Extensions menu.

After pulling extension updates: 1. Return to `chrome://extensions`. 2.
Click **Reload** on Samvaad. 3. Refresh the webpage or Google Meet tab
you are testing.

If you want to run extension checks, open a new terminal from the
repository root:

``` powershell
cd chrome-extension
npm install
npm run
```

`npm run` lists the scripts available in the current `package.json`. Run
a test command only if it is listed there. Do not run a build command
unless the current package defines one. For the unpacked extension,
select the folder that directly contains `manifest.json`.

## 6. Recommended startup order

For local sign-recognition testing, use separate terminals and keep each
process running:

1.  **Python recognition service** --- `isl-connect/include-ml`
2.  **Web app** --- `isl-comp-updated/isl-comp`
3.  **Chrome extension** --- load from `chrome://extensions`

Some extension features may work without the Python service. Live sign
recognition requires the service and the correct model checkpoint.

## 7. Troubleshooting

### Web app does not start

-   Confirm Node.js and npm are installed.
-   Run `npm install` inside `isl-comp-updated/isl-comp`.
-   Check the terminal for the actual error.
-   Make sure required environment variables and any separately required
    server are configured.

### Extension does not appear or changes are missing

-   Confirm Developer mode is enabled in `chrome://extensions`.
-   Select the `chrome-extension` folder containing `manifest.json`.
-   Click **Reload** after pulling changes, then refresh the target tab.
-   Check the extension's **Errors** panel.

### Sign recognition does not connect

-   Confirm `recognition_service.py` is running.
-   Confirm the configured URL is `ws://127.0.0.1:8765`.
-   Confirm the model checkpoint exists at the configured path.
-   Use Python 3.12 and compatible dependency versions.
-   Check the Python terminal for errors.

### Camera or microphone is unavailable

-   Allow camera/microphone permissions in Chrome.
-   Close other apps that may be using the camera.
-   Speech recognition availability can depend on browser/device support
    and internet connectivity.

### `git pull` refuses because of local changes

Do not use `git reset --hard` unless you intentionally want to discard
local work. Save or commit your changes first, then pull.

## 8. Git hygiene

Do **not** commit these local/generated items: - `venv/` or `venv312/` -
`node_modules/` - `.env.local` or credentials - `__pycache__/` or
`*.pyc` - Raw datasets, captured videos, or large model checkpoints
unless the team has explicitly decided to version them

Before pushing changes:

``` powershell
git status
git diff --check
```

## 9. Quick checklist

-   [ ] Latest code pulled from `main`
-   [ ] Web app dependencies installed
-   [ ] Web app starts locally
-   [ ] Python 3.12 virtual environment created
-   [ ] Compatible ML dependencies installed
-   [ ] Required model checkpoint available
-   [ ] Recognition service running, if testing recognition
-   [ ] Chrome extension loaded from `chrome-extension`
-   [ ] Extension reloaded after updates
