-- by latter

speed = 0.1--who fast do you want the effect to apply

timething = 0.5--timer for when the effect fully done

cooltrail = false

play_trail = true

char = 'bfdad'
function onEvent(n,v1,v2)
if n == 'cooltrail' then
if tonumber(v1) and play_trail then
cooltrail = true
play_trail = false
elseif tonumber(v1) and not play_trail then
cooltrail = false
play_trail = true
end

if v2 == 'bf' then
char = 'bf'
elseif v2 == 'dad' then
char = 'dad'
elseif v2 == 'bfdad' then
char = 'bfdad'
end
end
end



function onCreate()
runTimer('coale', speed, 0)

end


i = 1


function onTimerCompleted(tag)
if tag == 'coale' then
if cooltrail then
i = i + 1
if i >= 100 then
i = 0
end


tagn = ('jojo_reference'..i)
tagn2 = ('jojo_reference2'..i)
if char == 'dad' or char == 'bfdad' then
makeAnimatedLuaSprite(tagn, getProperty('dad.imageFile'), getProperty('dad.x'), getProperty('dad.y'))
doTweenAlpha('jojAOpp'..tagn, tagn, 0, timething, easeA)

updateHitbox(tagn)
setProperty(tagn..'.offset.x', getProperty('dad.offset.x'))
setProperty(tagn..'.offset.y', getProperty('dad.offset.y'))
setProperty(tagn..'.animation.frameName', getProperty('dad.animation.frameName'))
setProperty(tagn..'.flipX', getProperty('dad.flipX'))
setProperty(tagn..'.scale.x', getProperty('dad.scale.x'))
setProperty(tagn..'.scale.y', getProperty('dad.scale.y'))
addLuaSprite(tagn, true)


setProperty(tagn..'.colorTransform.redOffset', getProperty('dad.colorTransform.redOffset'))
setProperty(tagn..'.colorTransform.greenOffset', getProperty('dad.colorTransform.greenOffset'))
setProperty(tagn..'.colorTransform.blueOffset', getProperty('dad.colorTransform.blueOffset'))
end


if char == 'bf' or char == 'bfdad' then
makeAnimatedLuaSprite(tagn2, getProperty('boyfriend.imageFile'), getProperty('boyfriend.x'), getProperty('boyfriend.y'))
doTweenAlpha('jojAbf'..tagn2, tagn2, 0, timething, easeA)

updateHitbox(tagn2)
setProperty(tagn2..'.offset.x', getProperty('boyfriend.offset.x'))
setProperty(tagn2..'.offset.y', getProperty('boyfriend.offset.y'))
setProperty(tagn2..'.animation.frameName', getProperty('boyfriend.animation.frameName'))
setProperty(tagn2..'.flipX', getProperty('boyfriend.flipX'))
setProperty(tagn2..'.scale.x', getProperty('boyfriend.scale.x'))
setProperty(tagn2..'.scale.y', getProperty('boyfriend.scale.y'))

addLuaSprite(tagn2, true)

setProperty(tagn2..'.colorTransform.redOffset', getProperty('boyfriend.colorTransform.redOffset'))
setProperty(tagn2..'.colorTransform.greenOffset', getProperty('boyfriend.colorTransform.greenOffset'))
setProperty(tagn2..'.colorTransform.blueOffset', getProperty('boyfriend.colorTransform.blueOffset'))
end


end
end
end