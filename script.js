const REPLICATE_API_TOKEN = 'your_token_here';
// 虚拟试衣专用模型
const TRYON_MODEL = "zhengchong/coot-viton:1bf9ea8e820da48c57de0c0fd1a4d5d2d9cad6d43abfe5e3417f867a5adac11e";
// 全身生成模型
const FULLBODY_MODEL = "stability-ai/sdxl:39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b";

let selectedMode = 'tryon';

// 模式切换
document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        selectedMode = this.dataset.mode;
    });
});

// 预览功能
function setupPreview(inputId, previewId) {
    document.getElementById(inputId).addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                document.getElementById(previewId).innerHTML = 
                    `< img src="${e.target.result}" alt="预览">`;
            };
            reader.readAsDataURL(file);
        }
    });
}

setupPreview('faceInput', 'facePreview');
setupPreview('clothingInput', 'clothingPreview');

// 生成按钮
document.getElementById('generateBtn').addEventListener('click', async function() {
    const faceFile = document.getElementById('faceInput').files[0];
    const clothingFile = document.getElementById('clothingInput').files[0];
    
    if (!faceFile || !clothingFile) {
        alert('请上传人脸和衣服照片！');
        return;
    }

    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('loadingText').textContent = 
        selectedMode === 'tryon' ? 'AI正在试衣中...约20秒' : 'AI正在合成中...约15秒';
    document.getElementById('result').innerHTML = '';

    try {
        const faceUrl = await uploadImage(faceFile);
        const clothingUrl = await uploadImage(clothingFile);
        
        const prediction = selectedMode === 'tryon' 
            ? await callTryOnAPI(faceUrl, clothingUrl)
            : await callFullBodyAPI(faceUrl, clothingUrl);
        
        displayResult(prediction.output[0], selectedMode);
        
    } catch (error) {
        alert('生成失败: ' + error.message);
        console.error(error);
    } finally {
        document.getElementById('loading').classList.add('hidden');
    }
});

async function uploadImage(file) {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await fetch('https://api.replicate.com/v1/files', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${REPLICATE_API_TOKEN}`
        },
        body: formData
    });
    
    const data = await response.json();
    return data.urls.get;
}

// 虚拟试衣API调用
async function callTryOnAPI(faceUrl, clothingUrl) {
    const response = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            version: TRYON_MODEL,
            input: {
                person_image: faceUrl,
                garment_image: clothingUrl,
                // 关键prompt：保持人脸，替换服装
                prompt: "keep the person's face and pose exactly the same, only change the clothing to match the garment image, photorealistic, high quality",
                num_inference_steps: 30,
                guidance_scale: 7.5
            }
        })
    });
    
    const prediction = await response.json();
    return await pollResult(prediction);
}

// 全身合成API调用
async function callFullBodyAPI(faceUrl, clothingUrl) {
    const response = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            version: FULLBODY_MODEL,
            input: {
                image: faceUrl,
                prompt: `full body photo of a person wearing the same clothes as in the garment image, 
                        maintaining the same face identity, natural pose, standing, detailed, 4k, photorealistic`,
                negative_prompt: "blurry, bad anatomy, extra limbs, cropped face, headshot, close-up",
                strength: 0.8,
                num_inference_steps: 40,
                control_image: clothingUrl, // 使用服装图作为参考
                controlnet_conditioning_scale: 0.7
            }
        })
    });
    
    const prediction = await response.json();
    return await pollResult(prediction);
}

// 轮询结果
async function pollResult(prediction) {
    while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        const statusResponse = await fetch(prediction.urls.get, {
            headers: {
                'Authorization': `Bearer ${REPLICATE_API_TOKEN}`
            }
        });
        
        Object.assign(prediction, await statusResponse.json());
    }
    
    return prediction;
}

function displayResult(imageUrl, mode) {
    const modeText = mode === 'tryon' ? '虚拟试衣' : '全身合成';
    document.getElementById('result').innerHTML = `
        <h3>✅ ${modeText}结果</h3>
        < img src="${imageUrl}" alt="生成结果" class="result-image">
        <p style="color: #666; font-size: 14px;">提示：结果可能会有轻微瑕疵，可尝试更换照片重新生成</p >
        <a href=" " download class="download-btn">📥 下载图片</a >
    `;
}
