function onCreate()
setProperty('skipCountdown', true)
setProperty('camHUD.alpha',0)
end

function onUpdate()
if curStep == 659 then
setHealth(1)
end
end