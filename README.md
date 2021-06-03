# Screenmeter modification
Modification of the original activity application "screenmeter" from build80 team.
Added in the current assembly:

1. the time that was spent today (the indicator will take into account the time that was before the program was restarted)
2. displaying the image that was taken from the screen
3. removed activity tracking logic

# RUN

1. `npm install` | `npm install electron`
2. `npm run start` | `electron .`

# BUILD
Was use this instruction:
https://www.electronjs.org/docs/tutorial/quick-start

1. `npm install --save-dev @electron-forge/cli`
2. `npx electron-forge import`
3. `npm run make`