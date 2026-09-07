<!DOCTYPE html>
<html lang="en" class="scheme-only-dark">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="csrf-token" content="{{ csrf_token() }}">
<meta name="description" content="Wondrous — a turn-based fantasy arena. Draft six champions, command your warband, and outwit your rival.">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
@viteReactRefresh
@vite('resources/js/app.tsx')
@inertiaHead
</head>
<body class="antialiased">@inertia</body>
</html>
