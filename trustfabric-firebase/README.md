# TrustFabric Firebase

## Overview
TrustFabric is a Firebase-based project that utilizes Firebase Functions to handle backend logic and interact with Firebase services. This README provides instructions on setting up and using the project.

## Prerequisites
- Node.js (version 14 or later)
- Firebase CLI
- A Firebase project set up in the Firebase console

## Setup Instructions

1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd trustfabric-firebase
   ```

2. **Install Dependencies**
   Navigate to the `functions` directory and install the required dependencies:
   ```bash
   cd functions
   npm install
   ```

3. **Configure Firebase**
   - Place your `service-firebase.json` file in the `functions` directory. This file contains the service account credentials required for Firebase Admin SDK.

4. **Deploy Functions**
   Use the Firebase CLI to deploy your functions:
   ```bash
   firebase deploy --only functions
   ```

## Project Structure
- **functions/src/index.ts**: Entry point for Firebase functions.
- **functions/src/firebase.ts**: Firebase initialization logic.
- **functions/src/config.ts**: Configuration settings for Firebase functions.
- **functions/src/routes.ts**: Defines routes for handling HTTP requests.

## Usage
After deploying, you can access your Firebase functions via the URLs provided in the Firebase console. You can also test the functions locally using the Firebase emulator.

## Contributing
Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License
This project is licensed under the MIT License. See the LICENSE file for more details.