# Better MyEd 🍎

**Better MyEd** is a Chrome extension designed to enhance the usability and layout of the British Columbia MyEducation BC (MyEd) portal. It focuses on solving common interface frustrations, such as difficult navigation in large attendance tables and inefficient data views.

![Better MyEd Icon](icon128.png)

## ✨ Features

- **Sticky Table Headers & Columns**: Keep student names and dates in view while scrolling through large attendance or grade spreadsheets.
- **Enhanced Attendance Trends**: Automatically rearranges the "Trends" view to freeze core information, making it easier to track student progress over time.
- **Seamless Performance**: Runs efficiently in the background and only activates on MyEducation BC domains.
- **Smart Settings**: Toggle features on or off via the extension popup—your preferences are saved automatically for future sessions.

## 🛠️ How it Works

The extension uses content scripts to intelligently identify tables within the MyEd portal. It applies modern CSS layout techniques (like `position: sticky` and `backdrop-filter`) to "freeze" relevant columns and rows. In the Attendance Trends view, it dynamically reshuffles the DOM elements to provide a more intuitive horizontal scrolling experience.

## 🚀 Installation Guide (Unpackaged)

Since this extension is optimized for direct use and development, follow these steps to install it in Google Chrome without using the Chrome Web Store:

### 1. Download the Code
- Click the green **Code** button at the top of this repository.
- Select **Download ZIP** and extract it to a folder on your computer.
- *Or*, clone the repository using Git:
  ```bash
  git clone https://github.com/jcykung/better-myed.git
  ```

### 2. Open Chrome Extensions
- Launch Google Chrome.
- In the address bar, type `chrome://extensions/` and press **Enter**.
- Alternatively, click the **three dots** (Menu) > **Extensions** > **Manage Extensions**.

### 3. Enable Developer Mode
- In the top-right corner of the Extensions page, find the **Developer mode** toggle and turn it **ON**.

### 4. Load the Extension
- A new button labeled **Load unpacked** will appear in the top-left.
- Click **Load unpacked** and select the folder where you extracted/cloned the code (the folder containing `manifest.json`).

### 5. Start Using Better MyEd
- The extension is now active! 
- Navigate to the [MyEducation BC portal](https://myeducation.gov.bc.ca/aspen/logon.do).
- Click the **Extensions puzzle icon** in your Chrome toolbar and pin **Better MyEd** for quick access.

## ⚙️ Configuration

Open the extension popup by clicking the **Better MyEd** icon in your toolbar. You can toggle specific improvements (like Attendance Trends optimization) directly from there.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

*Made with ❤️ by [Jonathan Kung](https://github.com/jcykung)*
