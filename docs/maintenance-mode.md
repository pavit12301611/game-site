# Maintenance Mode

## What Visitors See

A clean notice with the operator's reason and a 16-digit access code box.

## How the Code Works

The admin generates a random 16-digit code. Visitors type it into the notice to unlock their device for testing. The code expires after the set duration.

## What It Does Not Protect

The data behind the site is protected by `firestore.rules`, exactly as it is with maintenance off.