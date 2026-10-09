import React, { useEffect, useState } from 'react';
import { getDashboardFullUrl, getFolderInfo} from '../../../api/dashboard';
import { useParams } from 'react-router-dom'
import { Breadcrumb } from '../../../components/Breadcrumb';


export const GrafanaDashboardComponent = () => {
    const { fid,did } = useParams()
    const [iframeSrc, setIframeSrc] = useState('')

    useEffect(() => {
        run();
    }, []);

    const run = async () => {
        try {
            const fParams = {
                id: fid
            }
            const resInfo = await getFolderInfo(fParams)
            const params = {
                theme: resInfo?.data?.theme,
                host:  resInfo?.data?.grafanaHost,
                uid: did
            }
            const res = await getDashboardFullUrl(params)
            setIframeSrc(res?.data)
        } catch (error) {
            console.error(error)
        }
    }

    return (
        <>
            <Breadcrumb items={['仪表盘', '详情']} />
            <div style={{ width: '100%', minWidth: 0, height: 'calc(100dvh - 180px)', minHeight: 420 }}>
                <iframe
                    src={iframeSrc}
                    title="Grafana 仪表盘"
                    style={{
                        display: 'block',
                        width: '100%',
                        height: '100%',
                        border: 0,
                    }}
                />
            </div >
        </>
    );
};
